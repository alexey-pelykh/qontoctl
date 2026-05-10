// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import type { Readable } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { RecurringTransferListResponseSchema, RecurringTransferSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

/**
 * Pattern matching the SCA session polling URL the core HTTP client logs at
 * verbose level. Matches both production (`/v2/sca/sessions/{token}`) and
 * sandbox-only mocked (`/v2/mocked_sca_sessions/{token}`) endpoints — the
 * core picks per `client.isSandbox`.
 */
const SCA_POLL_URL_RE = /\/v2\/(?:sca\/sessions|mocked_sca_sessions)\/([A-Za-z0-9_-]+)(?=\s|$|\/)/;

interface RecurringTransferItem {
  readonly id: string;
  readonly amount: number;
  readonly amount_currency: string;
  readonly beneficiary_id: string;
  readonly frequency: string;
  // `next_execution_date` is `null` after cancel; `status` is observed to be
  // omitted from sandbox responses. See `RecurringTransferSchema` in core.
  readonly next_execution_date: string | null;
  readonly status?: string;
}

interface RecurringTransferListResponse {
  readonly recurring_transfers: RecurringTransferItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

describe.skipIf(!hasOAuthCredentials())("recurring-transfer MCP tools (e2e)", () => {
  pinAuthPreference("oauth-first");

  let client: Client;
  let transport: StdioClientTransport;
  let stderrBuffer: string;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      // `--verbose` enables wire logging so the SCA polling URL appears on
      // stderr — sandbox SCA tests extract the token from there.
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

  /**
   * Wait for the SCA session polling URL to appear in the MCP server's
   * stderr (added after this call started), then extract and return the SCA
   * session token. Snapshotting `stderrBuffer.length` per-call ensures
   * sequential SCA flows in the same test (e.g. create → cancel) don't
   * re-capture a stale token from an earlier flow.
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

  // SCA orchestration is required for recurring_transfer_create against the
  // Qonto sandbox. Skip when no staging token (sandbox routing) is present.
  describe.skipIf(!hasStagingToken())("recurring_transfer_create (sandbox SCA)", () => {
    it("creates a recurring transfer with inline SCA mock-decision approval", async () => {
      const beneficiaryResult = await client.callTool({
        name: "beneficiary_list",
        arguments: { per_page: 1 },
      });
      const beneficiaryText = beneficiaryResult.content[0] as { type: string; text: string };
      const beneficiaryParsed = JSON.parse(beneficiaryText.text) as {
        beneficiaries: { id: string }[];
      };
      if (beneficiaryParsed.beneficiaries.length === 0) return;
      const beneficiaryId = (beneficiaryParsed.beneficiaries[0] as { id: string }).id;

      const accountResult = await client.callTool({ name: "account_list", arguments: {} });
      const accountText = accountResult.content[0] as { type: string; text: string };
      const accountParsed = JSON.parse(accountText.text) as { id: string }[];
      if (accountParsed.length === 0) return;
      const accountId = (accountParsed[0] as { id: string }).id;

      const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      // Kick off the tool call (blocks while CLI polls SCA session).
      const callPromise = client.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: beneficiaryId,
          bank_account_id: accountId,
          amount: 1.0,
          currency: "EUR",
          reference: "e2e-mcp-recurring",
          first_execution_date: futureDate,
          frequency: "monthly",
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

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.type).toBe("text");
      // Must be a successful recurring transfer (JSON), NOT an SCA-pending text response.
      expect(textContent.text).not.toMatch(/^SCA required/);

      const rt = JSON.parse(textContent.text) as RecurringTransferItem;
      RecurringTransferSchema.parse(rt);
      expect(rt).toHaveProperty("id");
      expect(rt.frequency).toBe("monthly");
      expect(rt).toHaveProperty("beneficiary_id", beneficiaryId);
    });
  });

  // Cancel exercises both create (write) and cancel (write). Create requires
  // SCA approval against the sandbox; cancel goes through the MCP tool which
  // does not currently orchestrate SCA polling (no `executeWithMcpSca`
  // wrapper, no `wait`/`sca_session_token` schema fields), so a second SCA
  // mock-decision flow cannot be hooked from the test side without modifying
  // the MCP tool. If the API requires SCA on cancel, `withClient` formats the
  // 428 as a structured "SCA required" pending response — the assertion
  // `cancelText.text !~ /^SCA required/` surfaces that as a separate bug
  // rather than masking it as a timeout.
  describe.skipIf(!hasStagingToken())("recurring_transfer_cancel (sandbox SCA)", () => {
    it("creates a recurring transfer with SCA approval and then cancels it", async () => {
      const beneficiaryResult = await client.callTool({
        name: "beneficiary_list",
        arguments: { per_page: 1 },
      });
      const beneficiaryText = beneficiaryResult.content[0] as { type: string; text: string };
      const beneficiaryParsed = JSON.parse(beneficiaryText.text) as {
        beneficiaries: { id: string }[];
      };
      if (beneficiaryParsed.beneficiaries.length === 0) return;
      const beneficiaryId = (beneficiaryParsed.beneficiaries[0] as { id: string }).id;

      const accountResult = await client.callTool({ name: "account_list", arguments: {} });
      const accountText = accountResult.content[0] as { type: string; text: string };
      const accountParsed = JSON.parse(accountText.text) as { id: string }[];
      if (accountParsed.length === 0) return;
      const accountId = (accountParsed[0] as { id: string }).id;

      const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      // --- Step 1: create with SCA approval. ---
      const createCallPromise = client.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: beneficiaryId,
          bank_account_id: accountId,
          amount: 1.0,
          currency: "EUR",
          reference: "e2e-mcp-cancel",
          first_execution_date: futureDate,
          frequency: "monthly",
          wait: 10,
        },
      });
      const createApprovalPromise = (async () => {
        const token = await captureScaTokenFromStderr(8_000);
        await new Promise((r) => setTimeout(r, 2_000));
        await client.callTool({
          name: "sca_session_mock_decision",
          arguments: { token, decision: "allow" },
        });
      })();
      const [createResult] = await Promise.all([createCallPromise, createApprovalPromise]);

      expect(createResult.isError).not.toBe(true);
      const createText = createResult.content[0] as { type: string; text: string };
      expect(createText.text).not.toMatch(/^SCA required/);
      const created = JSON.parse(createText.text) as RecurringTransferItem;
      expect(created).toHaveProperty("id");

      // --- Step 2: cancel (no inline SCA orchestration available). ---
      const cancelResult = await client.callTool({
        name: "recurring_transfer_cancel",
        arguments: { id: created.id },
      });

      expect(cancelResult.isError).not.toBe(true);
      const cancelText = cancelResult.content[0] as { type: string; text: string };
      expect(cancelText.text).not.toMatch(/^SCA required/);
      const canceled = JSON.parse(cancelText.text) as { canceled: boolean; id: string };
      expect(canceled.canceled).toBe(true);
      expect(canceled.id).toBe(created.id);
    });
  });

  describe("recurring_transfer_list", () => {
    it("lists recurring transfers", async () => {
      const result = await client.callTool({
        name: "recurring_transfer_list",
        arguments: {},
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text) as RecurringTransferListResponse;
      RecurringTransferListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("recurring_transfers");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.recurring_transfers)).toBe(true);
    });

    it("lists recurring transfers with pagination", async () => {
      const result = await client.callTool({
        name: "recurring_transfer_list",
        arguments: { per_page: 2, page: 1 },
      });

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      const parsed = JSON.parse(textContent.text) as RecurringTransferListResponse;
      expect(parsed.recurring_transfers.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });
  });

  describe("recurring_transfer_show", () => {
    it("shows a recurring transfer by ID", async () => {
      const listResult = await client.callTool({
        name: "recurring_transfer_list",
        arguments: { per_page: 1 },
      });
      const listText = listResult.content[0] as {
        type: string;
        text: string;
      };
      const listParsed = JSON.parse(listText.text) as RecurringTransferListResponse;
      const first = listParsed.recurring_transfers[0];
      if (first === undefined) return;

      const result = await client.callTool({
        name: "recurring_transfer_show",
        arguments: { id: first.id },
      });

      expect(result.content).toBeDefined();
      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      expect(textContent.type).toBe("text");

      const rt = JSON.parse(textContent.text) as RecurringTransferItem;
      RecurringTransferSchema.parse(rt);
      expect(rt.id).toBe(first.id);
      expect(rt).toHaveProperty("amount");
      expect(rt).toHaveProperty("frequency");
    });
  });
});
