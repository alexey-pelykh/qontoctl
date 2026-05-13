// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { BankAccountSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { CLI_PATH } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_POLL_URL_RE } from "../sca-helpers.js";

const execFileAsync = promisify(execFile);

interface BankAccountItem {
  readonly id: string;
  readonly name: string;
  readonly iban: string;
  readonly status: string;
  readonly currency: string;
}

interface SpawnedCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly scaTriggered: boolean;
}

/**
 * Spawn an SCA-gated CLI command with `--verbose --output json`, watch
 * stderr for the SCA polling URL, mock-approve the captured token, and
 * await exit. Tolerates the no-SCA path (sandbox does not gate every
 * write) — same pattern used in `packages/e2e/src/cards/cli.e2e.test.ts`
 * and `packages/e2e/src/beneficiaries/cli.e2e.test.ts`.
 */
async function runWithConditionalSca(args: readonly string[]): Promise<SpawnedCliResult> {
  const child = spawn("node", [CLI_PATH, "--verbose", "--output", "json", ...args], {
    env: cliEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let stderrBuffer = "";
  let scaToken: string | undefined;
  let approvePromise: Promise<unknown> = Promise.resolve();

  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    if (scaToken !== undefined) return;
    stderrBuffer += chunk;
    let nlIdx: number;
    while ((nlIdx = stderrBuffer.indexOf("\n")) !== -1) {
      const line = stderrBuffer.slice(0, nlIdx);
      stderrBuffer = stderrBuffer.slice(nlIdx + 1);
      if (scaToken !== undefined) continue;
      const match = line.match(SCA_POLL_URL_RE);
      if (match !== null && match[1] !== undefined) {
        scaToken = match[1];
        approvePromise = execFileAsync("node", [CLI_PATH, "sca-session", "mock-decision", scaToken, "allow"], {
          env: cliEnv(),
          timeout: 25_000,
        });
      }
    }
  });

  const exit = await new Promise<{ readonly code: number | null }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code });
    });
  });
  await approvePromise;

  return {
    stdout,
    stderr,
    exitCode: exit.code,
    scaTriggered: scaToken !== undefined,
  };
}

// ---------------------------------------------------------------------------
// SCA write paths: bank-account lifecycle (create → update → close)
// ---------------------------------------------------------------------------
//
// Empirical sandbox probe (2026-05-13, sandbox org `0909-future-club-2702`,
// OAuth token with `bank_account.write` scope granted; #563 retry):
//
//   - `account create` → `POST /v2/bank_accounts`            200 (no SCA)
//       Plan cap is 2 active accounts. The previous probe (#563 / 2026-05-12)
//       failed because the cap was already saturated; closing one of the
//       pre-existing accounts (`asdfasdf`) freed a slot, after which `create`
//       round-trips cleanly without an SCA challenge.
//
//   - `account update` → `PATCH /v2/bank_accounts/{id}`      200 (no SCA)
//       The PUT-vs-PATCH disambiguation was the load-bearing finding: Qonto's
//       sandbox returns `404 not_found` for `PUT /v2/bank_accounts/{id}` on
//       BOTH pre-existing and freshly-created accounts, but `PATCH` succeeds.
//       Core service `updateBankAccount` was changed from PUT → PATCH in the
//       same PR that landed this lifecycle test.
//
//   - `account close` → `POST /v2/bank_accounts/{id}/close`  428 sca_required → 200
//       SCA-gated. The `runWithConditionalSca` helper captures the SCA
//       session token from `--verbose` stderr (the `getScaSession` GET URL
//       leaks the token), mock-approves via the sandbox `mocked_sca_sessions`
//       endpoint, and the CLI's internal `executeWithCliSca` retry observes
//       the `allow` state and re-issues the close. Cleanup is self-contained
//       — the test closes the account it created so the plan cap stays at
//       1 active (the pre-existing `Hauptkonto`).
//
// The lifecycle below was empirically validated end-to-end against the live
// sandbox: create succeeds → update renames → close succeeds with SCA round-
// trip → re-listing confirms `status: closed`. Repeatable across runs as
// long as no other process saturates the plan-cap mid-run.
//
// Read-side coverage (`account list`, `account show`, `account iban-certificate`)
// lives in `packages/e2e/src/org-accounts/cli.e2e.test.ts` — out of scope here.
//
// See #563 for the deferral history (spun off from #553) and the PATCH-vs-PUT
// disambiguation that unblocked `update`.

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())(
  "bank-account CLI commands (e2e, SCA write paths)",
  () => {
    pinAuthPreference("oauth-first");

    it("bank-account lifecycle: create → update → close (conditional SCA-gating)", async () => {
      const runId = randomUUID().slice(0, 8);
      const initialName = `e2e-${runId}`;
      const renamedName = `e2e-${runId}-renamed`;

      // ---- Round-trip #1: create. Empirically no SCA in sandbox.
      const createResult = await runWithConditionalSca(["account", "create", "--name", initialName]);
      if (createResult.scaTriggered) {
        console.log(`[account create SCA probe] SCA triggered; round-trip exercised.`);
      } else {
        console.log(`[account create SCA probe] NO SCA in OAuth+sandbox.`);
      }
      if (createResult.exitCode !== 0) {
        throw new Error(
          `account create exited ${String(createResult.exitCode)}\n--- stderr ---\n${createResult.stderr}\n--- stdout ---\n${createResult.stdout}`,
        );
      }
      const created = JSON.parse(createResult.stdout) as BankAccountItem;
      BankAccountSchema.parse(created);
      expect(created.id.length).toBeGreaterThan(0);
      expect(created.name).toBe(initialName);
      expect(created.status).toBe("active");
      const testAccountId = created.id;

      // ---- Round-trip #2: update (rename). PATCH /v2/bank_accounts/{id}.
      // Empirically no SCA in sandbox.
      const updateResult = await runWithConditionalSca(["account", "update", testAccountId, "--name", renamedName]);
      if (updateResult.scaTriggered) {
        console.log(`[account update SCA probe] SCA triggered; round-trip exercised.`);
      } else {
        console.log(`[account update SCA probe] NO SCA in OAuth+sandbox.`);
      }
      if (updateResult.exitCode !== 0) {
        throw new Error(
          `account update exited ${String(updateResult.exitCode)}\n--- stderr ---\n${updateResult.stderr}\n--- stdout ---\n${updateResult.stdout}`,
        );
      }
      const updated = JSON.parse(updateResult.stdout) as BankAccountItem;
      expect(updated.id).toBe(testAccountId);
      expect(updated.name).toBe(renamedName);
      expect(updated.status).toBe("active");

      // ---- Round-trip #3: close. SCA-gated; the helper captures the token
      // from `--verbose` stderr and mock-approves so the CLI retry succeeds.
      const closeResult = await runWithConditionalSca(["account", "close", testAccountId, "--yes"]);
      if (closeResult.scaTriggered) {
        console.log(`[account close SCA probe] SCA triggered; round-trip exercised.`);
        expect(closeResult.stderr).toMatch(SCA_POLL_URL_RE);
      } else {
        console.log(`[account close SCA probe] NO SCA in OAuth+sandbox.`);
      }
      if (closeResult.exitCode !== 0) {
        throw new Error(
          `account close exited ${String(closeResult.exitCode)}\n--- stderr ---\n${closeResult.stderr}\n--- stdout ---\n${closeResult.stdout}`,
        );
      }
      const closeOutput = JSON.parse(closeResult.stdout) as { readonly closed: boolean; readonly id: string };
      expect(closeOutput.closed).toBe(true);
      expect(closeOutput.id).toBe(testAccountId);

      // Defensive post-close verification: the CLI's `account close` command
      // synthesizes `{closed: true, id}` from a static formatter regardless of
      // the actual API response body (`closeBankAccount` returns void). Without
      // this follow-up `account show`, a flake where the close attempt returned
      // 2xx but the account was not actually closed would pass silently.
      // Re-fetch and assert `status === "closed"` against the live API.
      const { stdout: showStdout } = await execFileAsync(
        "node",
        [CLI_PATH, "--output", "json", "account", "show", testAccountId],
        {
          env: cliEnv(),
          timeout: 15_000,
        },
      );
      const refetched = JSON.parse(showStdout) as BankAccountItem;
      expect(refetched.id).toBe(testAccountId);
      expect(refetched.status).toBe("closed");
    });
  },
);
