// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CLI_PATH, cli, cliRaw, SKIP, skipIfNotFound, skipMissingFixture } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_POLL_URL_RE } from "../sca-helpers.js";

const execFileAsync = promisify(execFile);

interface IntlBeneficiary {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly country: string;
}

interface IntlQuote {
  readonly id: string;
  readonly source_currency: string;
  readonly target_currency: string;
  readonly source_amount: number;
  readonly target_amount: number;
}

describe.skipIf(!hasOAuthCredentials())("intl-transfer CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("intl-transfer requirements", () => {
    it("returns requirements for a beneficiary", (ctx) => {
      // First list intl beneficiaries to get an ID. The intl-beneficiary
      // feature can be sandbox-gated; previously a bare try/catch swallowed
      // ANY error (including auth failures — the #496 class). Use the
      // 404-specific `skipIfNotFound` helper instead so genuine errors
      // (401 auth failure, 5xx) still surface as test failures.
      const stdout = skipIfNotFound("--output", "json", "intl-beneficiary", "list");
      if (stdout === SKIP) {
        skipMissingFixture(ctx, "intl-beneficiary list returned 404 — feature not enabled in sandbox");
      }
      const beneficiaries = JSON.parse(stdout) as { id: string }[];
      if (beneficiaries.length === 0) {
        skipMissingFixture(ctx, "no international beneficiaries in sandbox for intl-transfer requirements");
      }

      const id = (beneficiaries[0] as { id: string }).id;
      const output = cli("--output", "json", "intl-transfer", "requirements", id);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("requirements");
    });
  });
});

// OAuth+sandbox SCA probe for `intl-transfer create` — local-only (requires
// OAuth credentials AND a staging token). Sibling to the requirements
// describe; coexists because the create endpoint is SCA-gated whereas
// requirements is read-only. Mirrors the structure of
// `internal-transfers/cli.e2e.test.ts`'s SCA probe (#549).
//
// Setup chain (all OAuth, staging-token-routed):
//   1. Discover an intl-beneficiary across PROBE_CURRENCIES.
//   2. Create an intl-quote for the beneficiary's currency (small amount).
//   3. Spawn `intl-transfer create` with --verbose so the SCA polling URL
//      lands on stderr.
//   4. Either: SCA triggers → capture token from stderr → approve via
//      `sca-session mock-decision` → CLI's internal poller retries → assert
//      transfer JSON on stdout. Or: SCA does NOT trigger → assert no SCA URL
//      logged and the operation still returned a valid transfer.
// Either outcome is documented via `console.log` so the empirical truth is
// visible in CI / local runs without driving the test's pass/fail decision.
//
// Precondition: the test org must have ≥1 active intl-beneficiary in one
// of PROBE_CURRENCIES. The sandbox org `0909-future-club-2702` ships with
// zero on a fresh reset; #552's create_intl_beneficiary E2E provisions one
// as a side effect, so running #552 before this test populates the corridor
// and unblocks this assertion. When no beneficiary is available, the test
// skips with a console warning rather than failing.
describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("intl-transfer create (OAuth+sandbox SCA probe)", () => {
  pinAuthPreference("oauth-first");

  /**
   * Sandbox-provisionable currencies probed in priority order when
   * searching for an existing intl-beneficiary. The Qonto API requires
   * `--currency` on `intl beneficiary list`, so we have to query each
   * corridor explicitly.
   */
  const PROBE_CURRENCIES = ["USD", "GBP", "CHF", "CAD", "AUD", "JPY", "HKD", "SGD"];

  function discoverIntlBeneficiary(): IntlBeneficiary | undefined {
    for (const currency of PROBE_CURRENCIES) {
      const result = cliRaw(["--output", "json", "intl", "beneficiary", "list", "--currency", currency]);
      if (!result.ok) continue;
      let list: IntlBeneficiary[];
      try {
        list = JSON.parse(result.stdout) as IntlBeneficiary[];
      } catch {
        continue;
      }
      if (list.length > 0 && list[0] !== undefined) return list[0];
    }
    return undefined;
  }

  it("triggers SCA round-trip OR completes without SCA in OAuth+sandbox", async () => {
    const beneficiary = discoverIntlBeneficiary();
    if (beneficiary === undefined) {
      console.warn(
        `[e2e] intl-transfer create SCA probe: skipping — no intl-beneficiary found across ` +
          `[${PROBE_CURRENCIES.join(", ")}]. Provision one via #552's intl-beneficiary create flow ` +
          `(or run \`qontoctl intl beneficiary create\` against an SCA-cleared sandbox) and rerun.`,
      );
      return;
    }

    // Create a fresh quote per test run — intl quotes are single-use and
    // expire (their `expires_at` is short). A small `amount` keeps sandbox
    // perturbation negligible regardless of FX rate; `direction: "send"`
    // means the amount is what we pay in EUR (the org's home currency).
    const quoteOutput = cli(
      "--output",
      "json",
      "intl",
      "quote",
      "create",
      "--currency",
      beneficiary.currency,
      "--amount",
      "10",
      "--direction",
      "send",
    );
    const quote = JSON.parse(quoteOutput) as IntlQuote;
    expect(quote.id.length).toBeGreaterThan(0);

    const reference = `e2e-intl-sca-${randomUUID().slice(0, 12)}`;
    const child = spawn(
      "node",
      [
        CLI_PATH,
        "--verbose",
        "--output",
        "json",
        "intl-transfer",
        "create",
        "--beneficiary",
        beneficiary.id,
        "--quote",
        quote.id,
        "--field",
        `reference=${reference}`,
      ],
      { env: cliEnv(), stdio: ["ignore", "pipe", "pipe"] },
    );

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
    // Wait for the mock-decision subprocess so its result (or rejection)
    // is observable in the test's failure context.
    await approvePromise;

    if (scaToken !== undefined) {
      console.log(
        `[intl-transfer SCA probe] SCA triggered in OAuth+sandbox; round-trip exercised. ` +
          `Beneficiary currency: ${beneficiary.currency}.`,
      );
      expect(stderr).toMatch(SCA_POLL_URL_RE);
    } else {
      console.log(
        `[intl-transfer SCA probe] NO SCA in OAuth+sandbox at amount=10 EUR send. ` +
          `Beneficiary currency: ${beneficiary.currency}. ` +
          `The SCA round-trip primitives stay exercised by sca-continuation/ for transfer_create.`,
      );
      expect(stderr).not.toMatch(SCA_POLL_URL_RE);
    }

    if (exit.code !== 0) {
      throw new Error(
        `intl-transfer create exited ${String(exit.code)}\n--- stderr ---\n${stderr}\n--- stdout ---\n${stdout}`,
      );
    }
    const transfer = JSON.parse(stdout) as { id: string };
    expect(transfer.id.length).toBeGreaterThan(0);
  });
});
