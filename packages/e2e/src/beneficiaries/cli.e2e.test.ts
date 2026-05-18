// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, cliJson } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { approveAndRetryCli, SCA_POLL_URL_RE, triggerScaCli } from "../sca-helpers.js";

const execFileAsync = promisify(execFile);

interface Beneficiary {
  readonly id: string;
  readonly name: string;
  readonly iban: string;
  readonly status: string;
  readonly trusted: boolean;
}

/**
 * Generate a fresh mod-97-valid German IBAN per test run. Qonto sandbox
 * enforces IBAN uniqueness per organization (HTTP 400 "This IBAN has
 * already been taken" on `beneficiary add`), so a static IBAN corpus
 * burns out after a handful of runs. German IBANs have a clean BBAN
 * shape — bank code (8) + account number (10), no national check digit
 * — making runtime generation straightforward.
 *
 * The bank code `37040044` is Commerzbank Köln (a well-known German
 * bank that already appears in the sandbox's seeded beneficiaries),
 * which exercises the same IBAN-validation corridor as the existing
 * `DE89370400440532013000` test record. The account number is
 * `randomUUID`-derived to guarantee uniqueness across the conceivable
 * lifespan of any single sandbox org.
 */
function generateValidGermanIban(): string {
  const BANK_CODE = "37040044";
  // 10-digit account number from randomUUID's digit characters; pad with
  // randomUUID() reruns if we somehow get fewer than 10 digits.
  let accountDigits = randomUUID().replace(/\D/g, "");
  while (accountDigits.length < 10) {
    accountDigits += randomUUID().replace(/\D/g, "");
  }
  const account = accountDigits.slice(0, 10);
  const bban = BANK_CODE + account;
  // IBAN check-digit algorithm: build BBAN + "DE00", convert letters
  // (D=13, E=14, ... A=10..Z=35), compute mod 97, check = 98 - r.
  const numericSeed = bban + "131400";
  let remainder = 0;
  for (const c of numericSeed) {
    remainder = (remainder * 10 + Number(c)) % 97;
  }
  const check = 98 - remainder;
  return `DE${check.toString().padStart(2, "0")}${bban}`;
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
 * await exit. Tolerates the no-SCA path (sandbox sometimes does not gate
 * a given write) — see the conditional-outcome handling per #549/#550.
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
  // Wait on the mock-decision subprocess so its result (or rejection) is
  // observable in the test's failure context.
  await approvePromise;

  return {
    stdout,
    stderr,
    exitCode: exit.code,
    scaTriggered: scaToken !== undefined,
  };
}

// OAuth+sandbox SCA E2E for `beneficiary add`. Local-only — gated on
// OAuth credentials + staging token. Conditional SCA-outcome handling
// (triggered vs. not) follows the same pattern as
// `internal-transfers/cli.e2e.test.ts` (#549) and
// `intl-transfers/cli.e2e.test.ts` (#550) because empirical SCA
// enforcement varies by endpoint + sandbox state.
//
// `beneficiary update` SCA coverage lives in the second describe block
// below (#559) — a separate suite because its precondition (a
// `validated` SEPA beneficiary in the sandbox) and its SCA semantics
// (strictly gated, never direct) differ from `beneficiary add`.
//
// The CLI command `beneficiary add` already wraps with `executeWithCliSca`
// per the #449 audit refresh — no production code changes needed.
describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("beneficiary CLI commands (e2e, SCA write paths)", () => {
  pinAuthPreference("oauth-first");

  it("beneficiary add: triggers SCA round-trip OR creates directly in OAuth+sandbox", async () => {
    const runId = randomUUID().slice(0, 12);
    const name = `E2E SCA Test ${runId}`;
    const iban = generateValidGermanIban();

    const result = await runWithConditionalSca(["beneficiary", "add", "--name", name, "--iban", iban]);

    if (result.scaTriggered) {
      console.log(`[beneficiary add SCA probe] SCA triggered in OAuth+sandbox; round-trip exercised.`);
      expect(result.stderr).toMatch(SCA_POLL_URL_RE);
    } else {
      console.log(`[beneficiary add SCA probe] NO SCA in OAuth+sandbox for SEPA beneficiary add.`);
      expect(result.stderr).not.toMatch(SCA_POLL_URL_RE);
    }

    if (result.exitCode !== 0) {
      throw new Error(
        `beneficiary add exited ${String(result.exitCode)}\n--- stderr ---\n${result.stderr}\n--- stdout ---\n${result.stdout}`,
      );
    }

    const beneficiary = JSON.parse(result.stdout) as Beneficiary;
    expect(beneficiary.id.length).toBeGreaterThan(0);
    expect(beneficiary.name).toBe(name);
    expect(beneficiary.iban).toBe(iban);
  });
});

// OAuth+sandbox SCA E2E for `beneficiary update`. Local-only — gated on
// OAuth credentials + staging token. Unlike `beneficiary add` (whose
// SCA outcome is conditional in the sandbox, sometimes direct and
// sometimes gated), `PUT /v2/sepa/beneficiaries/{id}` empirically
// requires a `validated` SEPA beneficiary: the sandbox returns
// `404 not_found` for `status: pending` records (#551, #559). The test
// fails loudly when no validated beneficiary exists rather than
// silently skipping, so the precondition gap stays visible.
//
// Uses the shared SCA helpers (`triggerScaCli` + `approveAndRetryCli`)
// from `sca-helpers.ts` per #559 AC. Those helpers throw if SCA does
// not fire within their default 10s window, so the test asserts the
// SCA gate is actually exercised — not silently bypassed by an
// untrusted-payee exemption or sandbox quirk.
describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())(
  "beneficiary CLI commands (e2e, update SCA write path)",
  () => {
    pinAuthPreference("oauth-first");

    let validatedBeneficiary: Beneficiary;

    beforeAll(() => {
      // The precondition lookup uses api-key auth via `pinAuthPreference`
      // having already been resolved to `oauth-first` for the suite — the
      // `beneficiary list` call goes through the same auth path the test's
      // write call will. Filter to `status: validated` server-side so the
      // failure message reflects the precondition the AC names.
      // precondition: docs/qonto-sandbox-preconditions.md#put-v2-sepa-beneficiaries-id
      const beneficiaries = cliJson<Beneficiary[]>("beneficiary", "list", "--status", "validated");
      if (beneficiaries.length === 0) {
        throw new Error(
          "E2E precondition unmet: no SEPA beneficiary with `status: validated` in the sandbox. " +
            "PUT /v2/sepa/beneficiaries/{id} returns 404 for pending records (see #551, #559), so this " +
            "test cannot exercise the SCA round-trip without one. Manually validate a beneficiary in the " +
            "Qonto sandbox UI, or wait for the SCA-trigger validation path on `beneficiary add` to mature " +
            "so freshly-created records land in `validated`.",
        );
      }
      // Prefer a non-trusted beneficiary — trusted payees are SCA-exempt
      // under PSD2 Article 13(b), and the AC requires exercising the SCA
      // gate. Fall back to the first validated record if all are trusted
      // (defensive — sandbox state can drift) so the test still attempts
      // and fails-loudly via the helper timeout rather than silently
      // skipping the SCA assertion.
      validatedBeneficiary = beneficiaries.find((b) => !b.trusted) ?? (beneficiaries[0] as Beneficiary);
    });

    it("beneficiary update: triggers SCA round-trip and applies name change", async () => {
      const newName = `E2E SCA Update ${randomUUID().slice(0, 12)}`;

      const trigger = await triggerScaCli([
        "--output",
        "json",
        "beneficiary",
        "update",
        validatedBeneficiary.id,
        "--name",
        newName,
      ]);

      // AC #4 traceability (#445): token is a real base64url, not the
      // `"unknown"` fallback the parser used to emit.
      expect(trigger.scaSessionToken).not.toBe("unknown");
      expect(trigger.scaSessionToken).toMatch(/^[A-Za-z0-9_-]+$/);

      const exit = await approveAndRetryCli(trigger, "allow");

      if (exit.exitCode !== 0) {
        throw new Error(
          `beneficiary update exited ${String(exit.exitCode)}\n--- stderr ---\n${exit.stderr}\n--- stdout ---\n${exit.stdout}`,
        );
      }

      // Wire-log assertions prove the SCA continuation actually exercised:
      // the initial PUT and at least one SCA-session poll.
      expect(exit.stderr).toMatch(/PUT .*\/v2\/sepa\/beneficiaries\//);
      expect(exit.stderr).toMatch(SCA_POLL_URL_RE);

      const updated = JSON.parse(exit.stdout) as Beneficiary;
      expect(updated.id).toBe(validatedBeneficiary.id);
      expect(updated.name).toBe(newName);
    });
  },
);
