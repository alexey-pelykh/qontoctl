// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { DiagnosticReport, RedactionContext } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { exitCodeFor, formatDiagnoseJson, formatDiagnoseTable } from "./diagnose-format.js";

const NO_REDACTION: RedactionContext = { secrets: [] };

function buildReport(overrides: Partial<DiagnosticReport> = {}): DiagnosticReport {
  return {
    schemaVersion: "1.0",
    qontoctlVersion: "0.0.0-test",
    profile: "default",
    authMode: "oauth-first",
    configPath: "/tmp/test.yaml",
    stagingTokenPresent: true,
    capturedAt: "<frozen>",
    results: [
      {
        checkId: "config.resolution",
        status: "ok",
        detail: "loaded from /tmp/test.yaml",
        suggestedAction: null,
      },
      {
        checkId: "auth.oauth-health",
        status: "warn",
        detail: "refreshed expired access token",
        suggestedAction: null,
      },
    ],
    summaryCounts: { ok: 1, warn: 1, fail: 0, skip: 0, total: 2 },
    ...overrides,
  };
}

describe("formatDiagnoseTable", () => {
  it("renders unicode markers, padded ids, details, and a summary line", () => {
    const { rendered } = formatDiagnoseTable(buildReport(), { redaction: NO_REDACTION });
    expect(rendered).toContain("✓ config.resolution");
    expect(rendered).toContain("⚠ auth.oauth-health");
    expect(rendered).toContain("loaded from /tmp/test.yaml");
    expect(rendered).toContain("Summary: 1 ok, 1 warn, 0 fail, 0 skip");
    expect(rendered).toContain("Exit code: 2");
  });

  it("uses ASCII markers when ascii: true", () => {
    const { rendered } = formatDiagnoseTable(buildReport(), { ascii: true, redaction: NO_REDACTION });
    expect(rendered).toContain("[OK] config.resolution");
    expect(rendered).toContain("[WARN] auth.oauth-health");
    // Should not include unicode markers when ascii is set.
    expect(rendered).not.toContain("✓");
    expect(rendered).not.toContain("⚠");
  });

  it("appends suggested_action and evidence when verbose: true", () => {
    const report = buildReport({
      results: [
        {
          checkId: "auth.api-key-health",
          status: "fail",
          detail: "HTTP 401",
          suggestedAction: "API key was rejected",
          evidence: { status_code: 401 },
        },
      ],
      summaryCounts: { ok: 0, warn: 0, fail: 1, skip: 0, total: 1 },
    });
    const { rendered } = formatDiagnoseTable(report, { verbose: true, redaction: NO_REDACTION });
    expect(rendered).toContain("→ API key was rejected");
    expect(rendered).toContain('"status_code":401');
  });

  it("scrubs literal secrets and reports the leak", () => {
    const report = buildReport({
      results: [
        {
          checkId: "fake.leak",
          status: "ok",
          detail: "saw token=ak-very-secret-123456 in detail",
          suggestedAction: null,
        },
      ],
      summaryCounts: { ok: 1, warn: 0, fail: 0, skip: 0, total: 1 },
    });
    const { rendered, leaks } = formatDiagnoseTable(report, {
      redaction: { secrets: ["ak-very-secret-123456"] },
    });
    expect(rendered).not.toContain("ak-very-secret-123456");
    expect(rendered).toContain("[redacted-secret]");
    expect(leaks.length).toBeGreaterThan(0);
  });
});

describe("formatDiagnoseJson", () => {
  it("emits stable, alphabetically-sorted JSON keys at every level", () => {
    const { rendered } = formatDiagnoseJson(buildReport(), { redaction: NO_REDACTION });
    const parsed = JSON.parse(rendered) as Record<string, unknown>;
    const topKeys = Object.keys(parsed);
    const sortedTopKeys = [...topKeys].sort();
    expect(topKeys).toEqual(sortedTopKeys);
    // Spot-check: capturedAt and configPath should appear before results in sorted order.
    expect(topKeys.indexOf("capturedAt")).toBeLessThan(topKeys.indexOf("results"));
  });

  it("produces byte-identical output for back-to-back calls when input is unchanged (frozen-timestamp determinism)", () => {
    const a = formatDiagnoseJson(buildReport(), { redaction: NO_REDACTION });
    const b = formatDiagnoseJson(buildReport(), { redaction: NO_REDACTION });
    expect(a.rendered).toBe(b.rendered);
  });

  it("scrubs full IBAN values via the global tripwire", () => {
    const report = buildReport({
      results: [
        {
          checkId: "fake.iban-leak",
          status: "ok",
          detail: "iban=FR7612345987650123456789012",
          suggestedAction: null,
        },
      ],
      summaryCounts: { ok: 1, warn: 0, fail: 0, skip: 0, total: 1 },
    });
    const { rendered, leaks } = formatDiagnoseJson(report, { redaction: NO_REDACTION });
    expect(rendered).not.toContain("FR7612345987650123456789012");
    expect(rendered).toContain("[redacted-iban]");
    expect(leaks).toContain("iban-like");
  });
});

describe("exitCodeFor", () => {
  it("returns 1 when any check failed", () => {
    expect(
      exitCodeFor(
        buildReport({
          summaryCounts: { ok: 1, warn: 1, fail: 1, skip: 0, total: 3 },
        }),
      ),
    ).toBe(1);
  });

  it("returns 2 when there are warns but no fails", () => {
    expect(
      exitCodeFor(
        buildReport({
          summaryCounts: { ok: 1, warn: 1, fail: 0, skip: 0, total: 2 },
        }),
      ),
    ).toBe(2);
  });

  it("returns 0 when everything is ok or skipped", () => {
    expect(
      exitCodeFor(
        buildReport({
          summaryCounts: { ok: 7, warn: 0, fail: 0, skip: 2, total: 9 },
        }),
      ),
    ).toBe(0);
  });
});
