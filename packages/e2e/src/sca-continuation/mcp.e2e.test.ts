// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Readable } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TransferSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials, hasStagingToken } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

/**
 * Pattern matching the SCA session polling URL the core HTTP client logs at
 * verbose level. Tokens are base64url, so they survive `encodeURIComponent`
 * unchanged and contain only `[A-Za-z0-9_-]`. See
 * `packages/core/src/sca/sca-service.ts#getScaSession`.
 */
const SCA_POLL_URL_RE = /\/v2\/sca\/sessions\/([A-Za-z0-9_-]+)(?=\s|$)/;

/**
 * Pattern matching the literal `Session token: <token>` line in the
 * structured "SCA pending" MCP response from `formatScaPendingResponse`. See
 * `packages/mcp/src/sca.ts#formatScaPendingResponse`.
 */
const SCA_PENDING_TOKEN_RE = /Session token: ([A-Za-z0-9_-]+)/;

interface BeneficiaryItem {
  readonly id: string;
  readonly name: string;
  readonly iban: string;
  readonly status: string;
}

interface BankAccountItem {
  readonly id: string;
}

interface VopProofToken {
  readonly proof_token: { readonly token: string };
}

interface ToolTextContent {
  readonly type: string;
  readonly text: string;
}

function firstText(content: unknown): string {
  const arr = content as ToolTextContent[] | undefined;
  const first = arr?.[0];
  if (first === undefined) {
    throw new Error("Tool returned no content");
  }
  return first.text;
}

describe.skipIf(!hasCredentials() || !hasStagingToken())("SCA continuation MCP (e2e, sandbox)", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let stderrBuffer: string;
  let beneficiaryId: string;
  let beneficiaryName: string;
  let beneficiaryIban: string;
  let bankAccountId: string;
  let vopProofToken: string;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      // `--verbose` enables wire logging so the SCA polling URL (containing
      // the session token in its path) appears on the server's stderr stream.
      // Test 2 uses this stream to discover the token mid-poll.
      command: "node",
      args: [CLI_PATH, "--verbose", "mcp"],
      env: cliEnv(),
      cwd: cliCwd(),
      stderr: "pipe",
    });

    stderrBuffer = "";
    const stderrStream = transport.stderr as Readable | null;
    stderrStream?.setEncoding("utf-8");
    stderrStream?.on("data", (chunk: string) => {
      stderrBuffer += chunk;
    });

    client = new Client({ name: "e2e-sca-test", version: "0.0.0" });
    await client.connect(transport);

    // ---- Setup: pick a beneficiary, account, and pre-resolve VoP -----------

    const beneficiaryListResult = await client.callTool({
      name: "beneficiary_list",
      arguments: {},
    });
    const beneficiaryList = JSON.parse(firstText(beneficiaryListResult.content)) as {
      beneficiaries: BeneficiaryItem[];
    };
    const beneficiary =
      beneficiaryList.beneficiaries.find((b) => b.status === "validated") ?? beneficiaryList.beneficiaries[0];
    if (beneficiary === undefined) {
      throw new Error("E2E setup: no beneficiaries available in sandbox");
    }
    beneficiaryId = beneficiary.id;
    beneficiaryName = beneficiary.name;
    beneficiaryIban = beneficiary.iban;

    const accountListResult = await client.callTool({
      name: "account_list",
      arguments: {},
    });
    const accounts = JSON.parse(firstText(accountListResult.content)) as BankAccountItem[];
    const firstAccount = accounts[0];
    if (firstAccount === undefined) {
      throw new Error("E2E setup: no bank accounts available in sandbox");
    }
    bankAccountId = firstAccount.id;

    const vopResult = await client.callTool({
      name: "transfer_verify_payee",
      arguments: { iban: beneficiaryIban, name: beneficiaryName },
    });
    const vop = JSON.parse(firstText(vopResult.content)) as VopProofToken;
    vopProofToken = vop.proof_token.token;
  });

  afterAll(async () => {
    await client.close();
  });

  /**
   * Build a fresh `transfer_create` arguments object with a unique reference
   * so each test issues its own SCA session, immune to PSD2 dynamic-linking
   * single-use semantics.
   */
  function createArgs(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      beneficiary_id: beneficiaryId,
      bank_account_id: bankAccountId,
      reference: `e2e-sca-${randomUUID().slice(0, 12)}`,
      amount: 1.5,
      vop_proof_token: vopProofToken,
      ...extra,
    };
  }

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

  it("transfer_create with wait=10 + mock-decision allow at t=2s returns transfer in single call", async () => {
    const args = createArgs({ wait: 10 });

    // Kick off the tool call (blocks until SCA resolves or wait expires).
    const callStartedAt = Date.now();
    const callPromise = client.callTool({ name: "transfer_create", arguments: args });

    // Concurrently, capture the token mid-poll and approve at ~t=2s from
    // call start. The MCP wrapper polls every 3000ms; approving between the
    // first poll (at t≈0) and the second poll (at t≈3s) ensures the second
    // poll observes "allow" and the wrapper retries the POST.
    const approvalPromise = (async () => {
      const token = await captureScaTokenFromStderr(8_000);
      const elapsedSinceCall = Date.now() - callStartedAt;
      const remainingUntilT2 = Math.max(0, 2_000 - elapsedSinceCall);
      await new Promise((r) => setTimeout(r, remainingUntilT2));
      await client.callTool({
        name: "sca_session_mock_decision",
        arguments: { token, decision: "allow" },
      });
    })();

    const [callResult] = await Promise.all([callPromise, approvalPromise]);

    expect(callResult.isError).not.toBe(true);
    const text = firstText(callResult.content);
    // Must be a successful transfer (JSON), NOT an SCA-pending text response.
    expect(text).not.toMatch(/^SCA required/);
    const transfer = JSON.parse(text) as Record<string, unknown>;
    TransferSchema.parse(transfer);
    expect(transfer).toHaveProperty("id");
    expect(transfer).toHaveProperty("beneficiary_id", beneficiaryId);
    expect(transfer).toHaveProperty("reference", args["reference"]);
  });

  it("transfer_create with wait=5 returns SCA-pending; second call with sca_session_token after mock allow returns transfer", async () => {
    const args = createArgs({ wait: 5 });

    // First call: poll for 5s with no decision → SCA-pending response.
    const pendingResult = await client.callTool({ name: "transfer_create", arguments: args });
    expect(pendingResult.isError).not.toBe(true);
    const pendingText = firstText(pendingResult.content);
    expect(pendingText).toMatch(/^SCA required/);
    expect(pendingText).toContain("sca_session_show");
    expect(pendingText).toContain("sca_session_token");

    const tokenMatch = pendingText.match(SCA_PENDING_TOKEN_RE);
    expect(tokenMatch, `expected Session token line in SCA-pending response: ${pendingText}`).not.toBeNull();
    const token = tokenMatch?.[1] as string;

    // Approve via mock-decision.
    const approveResult = await client.callTool({
      name: "sca_session_mock_decision",
      arguments: { token, decision: "allow" },
    });
    expect(approveResult.isError).not.toBe(true);

    // Second call: identical params (PSD2 dynamic-linking binds the token to
    // amount + payee) plus the approved sca_session_token → transfer lands.
    const retryResult = await client.callTool({
      name: "transfer_create",
      arguments: { ...args, sca_session_token: token },
    });
    expect(retryResult.isError).not.toBe(true);
    const retryText = firstText(retryResult.content);
    expect(retryText).not.toMatch(/^SCA required/);
    const transfer = JSON.parse(retryText) as Record<string, unknown>;
    TransferSchema.parse(transfer);
    expect(transfer).toHaveProperty("id");
    expect(transfer).toHaveProperty("beneficiary_id", beneficiaryId);
    expect(transfer).toHaveProperty("reference", args["reference"]);
  });

  it("transfer_create with wait=false returns SCA-pending in <2s; second call with sca_session_token after mock allow returns transfer", async () => {
    const args = createArgs({ wait: false });

    // First call: pure two-step — must return immediately (no inline polling).
    const start = Date.now();
    const pendingResult = await client.callTool({ name: "transfer_create", arguments: args });
    const elapsedMs = Date.now() - start;

    expect(pendingResult.isError).not.toBe(true);
    expect(elapsedMs).toBeLessThan(2_000);

    const pendingText = firstText(pendingResult.content);
    expect(pendingText).toMatch(/^SCA required/);
    expect(pendingText).toContain("sca_session_show");
    expect(pendingText).toContain("sca_session_token");
    expect(pendingText).toContain("No inline poll was requested");

    const tokenMatch = pendingText.match(SCA_PENDING_TOKEN_RE);
    expect(tokenMatch, `expected Session token line in SCA-pending response: ${pendingText}`).not.toBeNull();
    const token = tokenMatch?.[1] as string;

    const approveResult = await client.callTool({
      name: "sca_session_mock_decision",
      arguments: { token, decision: "allow" },
    });
    expect(approveResult.isError).not.toBe(true);

    const retryResult = await client.callTool({
      name: "transfer_create",
      arguments: { ...args, sca_session_token: token },
    });
    expect(retryResult.isError).not.toBe(true);
    const retryText = firstText(retryResult.content);
    expect(retryText).not.toMatch(/^SCA required/);
    const transfer = JSON.parse(retryText) as Record<string, unknown>;
    TransferSchema.parse(transfer);
    expect(transfer).toHaveProperty("id");
    expect(transfer).toHaveProperty("beneficiary_id", beneficiaryId);
    expect(transfer).toHaveProperty("reference", args["reference"]);
  });
});
