// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { TransferSchema } from "@qontoctl/core";
import { beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, cliJson } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { approveAndRetryCli, SCA_POLL_URL_RE, triggerScaCli } from "../sca-helpers.js";

const execFileAsync = promisify(execFile);

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

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("SCA continuation CLI (e2e, sandbox)", () => {
  pinAuthPreference("oauth-first");

  let beneficiaryId: string;
  let bankAccountId: string;
  let vopProofToken: string;

  beforeAll(() => {
    const beneficiaries = cliJson<BeneficiaryItem[]>("beneficiary", "list");
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
      beneficiaries.find((b) => b.status === "validated" && !b.trusted) ?? beneficiaries.find((b) => !b.trusted);
    if (beneficiary === undefined) {
      throw new Error(
        "E2E setup: no non-trusted beneficiaries available in sandbox; " +
          "SCA-continuation tests need an untrusted beneficiary to trigger the SCA gate " +
          "(trusted beneficiaries are SCA-exempt under PSD2 Article 13(b))",
      );
    }
    beneficiaryId = beneficiary.id;

    const accounts = cliJson<BankAccountItem[]>("account", "list");
    // Pick the `main: true` account: in shared sandbox orgs the non-main
    // accounts are typically scratch / depleted and cause `400 insufficient_funds`
    // on the post-SCA retry — masking actual SCA-flow regressions as
    // environmental flakes. Fall back to the highest-balance account if no
    // main is flagged (defensive against sandbox config changes).
    const account = accounts.find((a) => a.main) ?? [...accounts].sort((a, b) => b.balance_cents - a.balance_cents)[0];
    if (account === undefined) {
      throw new Error("E2E setup: no bank accounts available in sandbox");
    }
    bankAccountId = account.id;

    // Pre-resolve the VoP proof token so the SCA test does not race against
    // a separate VoP API call inside the per-test 30s budget.
    const vop = cliJson<VopProofToken>(
      "transfer",
      "verify-payee",
      "--iban",
      beneficiary.iban,
      "--name",
      beneficiary.name,
    );
    vopProofToken = vop.proof_token.token;
  });

  it("transfer create triggers SCA, mock-decision allow, retry succeeds", async () => {
    const reference = `e2e-sca-${randomUUID().slice(0, 12)}`;

    // Round-trip primitives under test (#450):
    //   triggerScaCli — spawns a CLI write op, captures token mid-poll
    //   approveAndRetryCli — calls `sca-session mock-decision`, awaits exit
    const trigger = await triggerScaCli([
      "--output",
      "json",
      "transfer",
      "create",
      "--beneficiary",
      beneficiaryId,
      "--debit-account",
      bankAccountId,
      "--reference",
      reference,
      "--amount",
      "1.50",
      "--vop-proof-token",
      vopProofToken,
    ]);

    // AC #4: assert on the actual `sca_session_token` field, not the
    // `"unknown"` fallback (which #445 made the parser throw on).
    expect(trigger.scaSessionToken).not.toBe("unknown");
    expect(trigger.scaSessionToken).toMatch(/^[A-Za-z0-9_-]+$/);

    const exit = await approveAndRetryCli(trigger, "allow");

    if (exit.exitCode !== 0) {
      throw new Error(
        `transfer create exited ${String(exit.exitCode)}\n--- stderr ---\n${exit.stderr}\n--- stdout ---\n${exit.stdout}`,
      );
    }

    // Spinner output is non-deterministic across terminals, so assert on the
    // wire-log lines that prove the SCA continuation actually exercised:
    // initial transfer POST + at least one SCA-session poll.
    expect(exit.stderr).toMatch(/POST .*\/v2\/sepa\/transfers/);
    expect(exit.stderr).toMatch(SCA_POLL_URL_RE);

    const transfer = JSON.parse(exit.stdout) as Record<string, unknown>;
    TransferSchema.parse(transfer);
    expect(transfer).toHaveProperty("id");
    expect(transfer).toHaveProperty("beneficiary_id", beneficiaryId);
    expect(transfer).toHaveProperty("reference", reference);
  });

  it("transfer create with --sca-auto-approve allow succeeds in a single CLI invocation (no external mock-decision)", async () => {
    // AC #5 (#577): exercise the auto-approve path end-to-end without external
    // orchestration. The CLI must trigger SCA, fire `mock-decision allow`
    // internally, observe the resolved state on the next poll, retry the
    // operation, and exit 0 with the transfer JSON in stdout — all in a single
    // process.
    const reference = `e2e-sca-auto-${randomUUID().slice(0, 12)}`;

    const { stdout, stderr } = await execFileAsync(
      "node",
      [
        CLI_PATH,
        "--verbose",
        "--output",
        "json",
        "--sca-auto-approve",
        "allow",
        "transfer",
        "create",
        "--beneficiary",
        beneficiaryId,
        "--debit-account",
        bankAccountId,
        "--reference",
        reference,
        "--amount",
        "1.50",
        "--vop-proof-token",
        vopProofToken,
      ],
      { env: cliEnv({ authPreference: "oauth-first" }), timeout: 30_000 },
    );

    // The SCA polling URL must still appear in verbose stderr — auto-approve
    // is layered on top of the existing flow, not a bypass.
    expect(stderr).toMatch(SCA_POLL_URL_RE);
    // The mock-decision POST must appear in the wire log too (sandbox-only path).
    expect(stderr).toMatch(/POST .*\/v2\/mocked_sca_sessions\/[A-Za-z0-9_-]+\/allow/);

    const transfer = JSON.parse(stdout) as Record<string, unknown>;
    TransferSchema.parse(transfer);
    expect(transfer).toHaveProperty("id");
    expect(transfer).toHaveProperty("beneficiary_id", beneficiaryId);
    expect(transfer).toHaveProperty("reference", reference);
  });
});
