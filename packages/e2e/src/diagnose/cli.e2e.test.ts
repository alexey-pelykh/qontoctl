// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { DiagnosticReportSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliRaw, CLI_PATH } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

/**
 * Diagnose CLI E2E. Gated on api-key credentials so it runs in CI (which
 * has only api-key) and locally (where both credential types are usually
 * configured).
 *
 * Diagnose's exit code is 0/1/2 depending on whether any check warned or
 * failed. Tests use {@link cliRaw} (not {@link cli}) because non-zero
 * exits are legitimate diagnose outcomes (e.g., expired OAuth in the
 * developer's local profile produces a `fail` and exits 1 — that's the
 * point of the tool).
 *
 * Assertions are written to be deterministic regardless of the live
 * profile's exact health: we assert on the structural shape (9 checks,
 * known IDs, summary tally) and on the api-key-health check result
 * (which is the credential the test environment is built around).
 */
describe.skipIf(!hasApiKeyCredentials())("diagnose CLI (e2e)", () => {
  /** Run diagnose and return its parsed report; succeeds for any 0/1/2 exit. */
  function runDiagnose(...extraArgs: string[]) {
    const result = cliRaw(["diagnose", "--diagnose-output", "json", ...extraArgs]);
    expect(result.stdout.length).toBeGreaterThan(0);
    return DiagnosticReportSchema.parse(JSON.parse(result.stdout));
  }

  it("runs all 9 default checks and emits a parseable JSON report", () => {
    // AC scenario 1 (partial): given a configured profile, all default
    // checks execute and the report parses against the canonical schema.
    const report = runDiagnose();
    expect(report.results.length).toBe(9);
    const checkIds = new Set(report.results.map((r) => r.checkId));
    expect(checkIds).toContain("config.resolution");
    expect(checkIds).toContain("auth.credentials-present");
    expect(checkIds).toContain("auth.api-key-health");
    expect(checkIds).toContain("auth.oauth-health");
    expect(checkIds).toContain("auth.scopes");
    expect(checkIds).toContain("org.metadata");
    expect(checkIds).toContain("org.bank-accounts-count");
    expect(checkIds).toContain("org.einvoicing-settings");
    expect(checkIds).toContain("routing.host-target");
    // The summary must match the result tally.
    const counts = { ok: 0, warn: 0, fail: 0, skip: 0 };
    for (const r of report.results) counts[r.status]++;
    expect(report.summaryCounts.ok).toBe(counts.ok);
    expect(report.summaryCounts.warn).toBe(counts.warn);
    expect(report.summaryCounts.fail).toBe(counts.fail);
    expect(report.summaryCounts.skip).toBe(counts.skip);
    expect(report.summaryCounts.total).toBe(report.results.length);
  });

  it("api-key-health passes against the live sandbox profile", () => {
    // The profile under test has a working api-key (CI requirement: it
    // is the credential the e2e job uses). If api-key-health fails here
    // the test environment itself is broken.
    const report = runDiagnose();
    const apiKeyResult = report.results.find((r) => r.checkId === "auth.api-key-health");
    expect(apiKeyResult).toBeDefined();
    expect(apiKeyResult?.status).toBe("ok");
  });

  it("renders a table with status markers and a summary line", () => {
    const result = cliRaw(["diagnose", "--diagnose-output", "table", "--ascii"]);
    expect(result.stdout).toContain("[OK] config.resolution");
    expect(result.stdout).toMatch(/Summary: \d+ ok, \d+ warn, \d+ fail, \d+ skip/);
    expect(result.stdout).toMatch(/Exit code: \d/);
  });

  it("--frozen-timestamp produces byte-identical JSON across back-to-back runs", () => {
    const a = cliRaw(["diagnose", "--diagnose-output", "json", "--frozen-timestamp"]);
    const b = cliRaw(["diagnose", "--diagnose-output", "json", "--frozen-timestamp"]);
    expect(a.stdout).toBe(b.stdout);
  });

  it("AC scenario 3-like: bad api-key surfaces api-key-health: fail (api-key-only auth chain)", () => {
    // Override creds with intentionally-bogus api-key. Pin auth=api-key
    // so no fallback chain can mask the failure — diagnose probes the
    // api-key client in isolation regardless, but the env pin keeps the
    // rest of the report deterministic.
    const env = {
      ...cliEnv(),
      QONTOCTL_ORGANIZATION_SLUG: "definitely-not-a-real-org-12345",
      QONTOCTL_SECRET_KEY: "definitely-not-a-real-key-12345",
      QONTOCTL_AUTH: "api-key",
    };
    let stdout = "";
    let exitCode = 0;
    try {
      stdout = execFileSync("node", [CLI_PATH, "diagnose", "--diagnose-output", "json"], {
        encoding: "utf-8",
        env,
        timeout: 15_000,
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: Buffer | string };
      exitCode = err.status ?? 1;
      stdout = typeof err.stdout === "string" ? err.stdout : (err.stdout?.toString("utf-8") ?? "");
    }
    // R-EC-2: any fail → exit 1
    expect(exitCode).toBe(1);
    const report = DiagnosticReportSchema.parse(JSON.parse(stdout));
    const apiKey = report.results.find((r) => r.checkId === "auth.api-key-health");
    expect(apiKey).toBeDefined();
    expect(apiKey?.status).toBe("fail");
    expect(apiKey?.suggestedAction).not.toBeNull();
  });

  it("redaction audit: JSON output contains no IBANs, JWTs, or 13-19 digit number runs", () => {
    // R-RS-1 / Quality §7 "Sensitive-Data Leakage MUST: zero" — regex
    // scan over the JSON for any unmasked sensitive shape. Diagnose
    // evidence is whitelisted to non-numeric IDs and small counts; any
    // match here means a check leaked through `detail` and the global
    // tripwire failed to scrub it.
    const result = cliRaw(["diagnose", "--diagnose-output", "json"]);
    expect(result.stdout).not.toMatch(/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+/);
    expect(result.stdout).not.toMatch(/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/);
    expect(result.stdout).not.toMatch(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/);
    expect(result.stdout).not.toMatch(/\b\d{13,19}\b/);
  });

  it("--help describes the command", () => {
    const result = cliRaw(["diagnose", "--help"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stdout).toContain("diagnose");
      expect(result.stdout).toContain("--diagnose-output");
      expect(result.stdout).toContain("--ascii");
    }
  });
});
