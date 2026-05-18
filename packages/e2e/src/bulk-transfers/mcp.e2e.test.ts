// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Readable } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { BulkTransferListResponseSchema, BulkTransferSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult, skipIfToolError, skipMissingFixture } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";

/**
 * Pattern matching the SCA session polling URL the core HTTP client logs at
 * verbose level. Matches both production (`/v2/sca/sessions/{token}`) and
 * sandbox-only mocked (`/v2/mocked_sca_sessions/{token}`) endpoints — the core
 * picks per `client.isSandbox`.
 */
const SCA_POLL_URL_RE = /\/v2\/(?:sca\/sessions|mocked_sca_sessions)\/([A-Za-z0-9_-]+)(?=\s|$|\/)/;

// Local response-shape interface. Named distinctly from the core export
// `BulkTransferRecord` (request-side per-item) — this describes the BulkTransfer
// job record returned by the API.
interface BulkTransferRecord {
  readonly id: string;
  readonly initiator_id: string;
  readonly total_count: number;
  readonly completed_count: number;
  readonly pending_count: number;
  readonly failed_count: number;
}

interface BulkTransferListResponse {
  readonly bulk_transfers: BulkTransferRecord[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

describe.skipIf(!hasOAuthCredentials())("bulk-transfer MCP tools (e2e)", () => {
  pinAuthPreference("oauth-first");

  let client: Client;
  let transport: StdioClientTransport;
  let stderrBuffer: string;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      // `--verbose` enables wire logging so the SCA polling URL appears on
      // stderr — the create test extracts the SCA token from there.
      args: [CLI_PATH, "--verbose", "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    stderrBuffer = "";
    const stderrStream = transport.stderr as Readable | null;
    stderrStream?.setEncoding("utf-8");
    stderrStream?.on("data", (chunk: string) => {
      stderrBuffer += chunk;
    });

    client = new Client({
      name: "e2e-test-client",
      version: "0.0.0",
    });

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  // SCA orchestration is required for bulk_transfer_create against sandbox
  // (same pattern as sca-continuation/mcp.e2e.test.ts). Skip when no staging
  // token (sandbox routing) is present.
  describe.skipIf(!hasStagingToken())("bulk_transfer_create (sandbox SCA)", () => {
    /**
     * Wait for the SCA session polling URL to appear in the MCP server's
     * stderr, then extract and return the SCA session token.
     */
    async function captureScaTokenFromStderr(timeoutMs: number): Promise<string> {
      const deadline = Date.now() + timeoutMs;
      const stderrAtStart = stderrBuffer.length;
      for (;;) {
        const fresh = stderrBuffer.slice(stderrAtStart);
        const match = fresh.match(SCA_POLL_URL_RE);
        if (match !== null && match[1] !== undefined) {
          return match[1];
        }
        if (Date.now() >= deadline) {
          throw new Error(`Timed out (${String(timeoutMs)}ms) waiting for SCA polling URL in MCP server stderr`);
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    it("creates a bulk transfer with inline SCA mock-decision approval", async (ctx) => {
      const beneficiaryResult = await client.callTool({
        name: "beneficiary_list",
        arguments: { per_page: 1 },
      });
      const beneficiaryParsed = JSON.parse(firstTextFromMcpResult(beneficiaryResult)) as {
        beneficiaries: { id: string }[];
      };
      if (beneficiaryParsed.beneficiaries.length === 0) {
        skipMissingFixture(ctx, "no beneficiaries in sandbox for bulk_transfer_create");
      }
      const beneficiaryId = (beneficiaryParsed.beneficiaries[0] as { id: string }).id;

      const accountResult = await client.callTool({ name: "account_list", arguments: {} });
      const accountParsed = JSON.parse(firstTextFromMcpResult(accountResult)) as { id: string }[];
      if (accountParsed.length === 0) {
        skipMissingFixture(ctx, "no bank accounts in sandbox for bulk_transfer_create");
      }
      const bankAccountId = (accountParsed[0] as { id: string }).id;

      // Kick off the tool call (blocks while CLI polls SCA session).
      const callPromise = client.callTool({
        name: "bulk_transfer_create",
        arguments: {
          bank_account_id: bankAccountId,
          bulk_transfers: [{ beneficiary_id: beneficiaryId, amount: "1.00", reference: "e2e-mcp-bulk" }],
          wait: 10,
        },
      });

      // Concurrently capture the token mid-poll and approve at ~t=2s.
      const approvalPromise = (async () => {
        const token = await captureScaTokenFromStderr(8_000);
        await new Promise((r) => setTimeout(r, 2_000));
        await client.callTool({
          name: "sca_session_mock_decision",
          arguments: { token, decision: "allow" },
        });
      })();

      const [result] = await Promise.all([callPromise, approvalPromise]);

      expect(result.isError).not.toBe(true);

      const text = firstTextFromMcpResult(result);
      // Must be a successful bulk transfer (JSON), NOT an SCA-pending text response.
      expect(text).not.toMatch(/^SCA required/);

      const bt = JSON.parse(text) as BulkTransferRecord;
      BulkTransferSchema.parse(bt);
      expect(bt).toHaveProperty("id");
      expect(bt).toHaveProperty("total_count");
      expect(bt.total_count).toBe(1);
    });
  });

  describe("bulk_transfer_list", () => {
    it("lists bulk transfers", async () => {
      const result = await client.callTool({
        name: "bulk_transfer_list",
        arguments: {},
      });

      expect(result.isError).not.toBe(true);

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as BulkTransferListResponse;
      BulkTransferListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("bulk_transfers");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.bulk_transfers)).toBe(true);
    });

    it("lists bulk transfers with pagination", async () => {
      const result = await client.callTool({
        name: "bulk_transfer_list",
        arguments: { per_page: 2, page: 1 },
      });

      expect(result.isError).not.toBe(true);

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as BulkTransferListResponse;
      expect(parsed.bulk_transfers.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });
  });

  describe("bulk_transfer_show", () => {
    it("shows a bulk transfer by ID", async (ctx) => {
      const listResult = await client.callTool({
        name: "bulk_transfer_list",
        arguments: { per_page: 1 },
      });
      skipIfToolError(listResult, ctx, "feature-not-supported", "bulk_transfer_list");

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as BulkTransferListResponse;
      const first = listParsed.bulk_transfers[0];
      if (first === undefined) {
        skipMissingFixture(ctx, "no bulk transfers in sandbox to resolve an id for bulk_transfer_show");
      }

      const result = await client.callTool({
        name: "bulk_transfer_show",
        arguments: { id: first.id },
      });

      const bt = JSON.parse(firstTextFromMcpResult(result)) as BulkTransferRecord;
      BulkTransferSchema.parse(bt);
      expect(bt.id).toBe(first.id);
      expect(bt).toHaveProperty("total_count");
    });
  });
});
