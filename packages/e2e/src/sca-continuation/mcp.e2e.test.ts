// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TransferSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { approveAndRetryMcp, SCA_POLL_URL_RE, triggerScaMcp } from "../sca-helpers.js";

interface BeneficiaryItem {
  readonly id: string;
  readonly name: string;
  readonly iban: string;
  readonly status: string;
  readonly trusted: boolean;
}

interface BankAccountItem {
  readonly id: string;
  readonly main: boolean;
  readonly balance_cents: number;
}

interface VopProofToken {
  readonly proof_token: { readonly token: string };
}

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("SCA continuation MCP (e2e, sandbox)", () => {
  pinAuthPreference("oauth-first");

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
      // The inline-poll test (`wait: 10`) uses this stream to discover the
      // token mid-poll; the two-step tests use the SCA-pending response
      // body via `triggerScaMcp` and don't need the stderr signal.
      command: "node",
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

    client = new Client({ name: "e2e-sca-test", version: "0.0.0" });
    await client.connect(transport);

    // ---- Setup: pick a beneficiary, account, and pre-resolve VoP -----------

    const beneficiaryListResult = await client.callTool({
      name: "beneficiary_list",
      arguments: {},
    });
    const beneficiaryList = JSON.parse(firstTextFromMcpResult(beneficiaryListResult)) as {
      beneficiaries: BeneficiaryItem[];
    };
    // PSD2 Article 13(b): transfers to "trusted" beneficiaries are exempt from
    // SCA. To exercise the SCA continuation flow under test we MUST pick a
    // non-trusted beneficiary — otherwise the sandbox responds to the initial
    // POST with 200 OK directly, no 428/polling URL is logged, and the test
    // fails at the "capture SCA session token" assertion (#491).
    //
    // Prefer `validated && !trusted` so the SCA challenge under test is the
    // transfer-level one (the code path the SCA continuation flow is designed
    // for). Fall back to any `!trusted` beneficiary (typically `pending`),
    // whose first-use validation challenge produces an equivalent SCA session
    // that exercises the same client polling/retry code path.
    const beneficiary =
      beneficiaryList.beneficiaries.find((b) => b.status === "validated" && !b.trusted) ??
      beneficiaryList.beneficiaries.find((b) => !b.trusted);
    if (beneficiary === undefined) {
      throw new Error(
        "E2E setup: no non-trusted beneficiaries available in sandbox; " +
          "SCA-continuation tests need an untrusted beneficiary to trigger the SCA gate " +
          "(trusted beneficiaries are SCA-exempt under PSD2 Article 13(b))",
      );
    }
    beneficiaryId = beneficiary.id;
    beneficiaryName = beneficiary.name;
    beneficiaryIban = beneficiary.iban;

    const accountListResult = await client.callTool({
      name: "account_list",
      arguments: {},
    });
    const accounts = JSON.parse(firstTextFromMcpResult(accountListResult)) as BankAccountItem[];
    // Pick the `main: true` account: in shared sandbox orgs the non-main
    // accounts are typically scratch / depleted and cause `400 insufficient_funds`
    // on the post-SCA retry — masking actual SCA-flow regressions as
    // environmental flakes. Fall back to the highest-balance account if no
    // main is flagged (defensive against sandbox config changes).
    const account =
      accounts.find((a) => a.main) ?? [...accounts].sort((a, b) => b.balance_cents - a.balance_cents)[0];
    if (account === undefined) {
      throw new Error("E2E setup: no bank accounts available in sandbox");
    }
    bankAccountId = account.id;

    const vopResult = await client.callTool({
      name: "transfer_verify_payee",
      arguments: { iban: beneficiaryIban, name: beneficiaryName },
    });
    const vop = JSON.parse(firstTextFromMcpResult(vopResult)) as VopProofToken;
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
  function createArgs(): Record<string, unknown> {
    return {
      beneficiary_id: beneficiaryId,
      bank_account_id: bankAccountId,
      reference: `e2e-sca-${randomUUID().slice(0, 12)}`,
      amount: 1.5,
      vop_proof_token: vopProofToken,
    };
  }

  /**
   * Wait for the SCA session polling URL to appear in the MCP server's
   * stderr, then extract and return the SCA session token. Used only by
   * the inline-poll variant (`wait: 10`) — the two-step tests get the
   * token from the SCA-pending response body via `triggerScaMcp`.
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
    // Inline-poll variant: the server polls inside the call, so the test
    // must approve concurrently while the call is in flight. This pattern
    // is structurally distinct from the two-step round-trip exercised
    // below — it stays expressed at the raw `client.callTool` layer.
    const args = { ...createArgs(), wait: 10 };

    const callStartedAt = Date.now();
    const callPromise = client.callTool({ name: "transfer_create", arguments: args });

    // Concurrently, capture the token mid-poll and approve at ~t=2s from
    // call start. The MCP wrapper polls every 3000ms; approving between the
    // first poll (at t≈0) and the second poll (at t≈3s) ensures the second
    // poll observes "allow" and the wrapper retries the POST.
    const approvalPromise = (async () => {
      const token = await captureScaTokenFromStderr(8_000);
      // AC #4 traceability: token must be a real base64url, not "unknown".
      expect(token).not.toBe("unknown");
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

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
    const text = firstTextFromMcpResult(callResult);
    // Must be a successful transfer (JSON), NOT an SCA-pending text response.
    expect(text).not.toMatch(/^SCA required/);
    const transfer = JSON.parse(text) as Record<string, unknown>;
    TransferSchema.parse(transfer);
    expect(transfer).toHaveProperty("id");
    expect(transfer).toHaveProperty("beneficiary_id", beneficiaryId);
    expect(transfer).toHaveProperty("reference", args["reference"]);
  });

  it("transfer_create with wait=5 returns SCA-pending; second call with sca_session_token after mock allow returns transfer", async () => {
    // Two-step round-trip via the bounded-poll variant: server polls 5s,
    // returns pending after timeout, test approves, retries with token.
    // Exercises `triggerScaMcp(..., { wait: 5 })` + `approveAndRetryMcp`.
    const args = createArgs();

    const trigger = await triggerScaMcp(client, "transfer_create", args, { wait: 5 });

    // AC #4: assert on the actual `sca_session_token` field — not the
    // literal `"unknown"` sentinel that #445 removed from the codebase.
    expect(trigger.scaSessionToken).not.toBe("unknown");
    expect(trigger.scaSessionToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(trigger.pendingText).toContain("sca_session_show");
    expect(trigger.pendingText).toContain("sca_session_token");

    const retryResult = await approveAndRetryMcp(trigger, "allow");

    expect(retryResult.isError).not.toBe(true);
    const retryText = firstTextFromMcpResult(retryResult);
    expect(retryText).not.toMatch(/^SCA required/);
    const transfer = JSON.parse(retryText) as Record<string, unknown>;
    TransferSchema.parse(transfer);
    expect(transfer).toHaveProperty("id");
    expect(transfer).toHaveProperty("beneficiary_id", beneficiaryId);
    expect(transfer).toHaveProperty("reference", args["reference"]);
  });

  it("transfer_create with wait=false returns SCA-pending in <2s; second call with sca_session_token after mock allow returns transfer", async () => {
    // Pure two-step variant — server returns pending immediately on 428,
    // no inline polling. This is the canonical pattern Group 6 write
    // tests will use, so the helper defaults to `wait: false`.
    const args = createArgs();

    const start = Date.now();
    const trigger = await triggerScaMcp(client, "transfer_create", args);
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(2_000);
    // AC #4 traceability.
    expect(trigger.scaSessionToken).not.toBe("unknown");
    expect(trigger.scaSessionToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(trigger.pendingText).toContain("sca_session_show");
    expect(trigger.pendingText).toContain("sca_session_token");
    expect(trigger.pendingText).toContain("No inline poll was requested");

    const retryResult = await approveAndRetryMcp(trigger, "allow");

    expect(retryResult.isError).not.toBe(true);
    const retryText = firstTextFromMcpResult(retryResult);
    expect(retryText).not.toMatch(/^SCA required/);
    const transfer = JSON.parse(retryText) as Record<string, unknown>;
    TransferSchema.parse(transfer);
    expect(transfer).toHaveProperty("id");
    expect(transfer).toHaveProperty("beneficiary_id", beneficiaryId);
    expect(transfer).toHaveProperty("reference", args["reference"]);
  });
});
