// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import { computeSummaryCounts, runDiagnose } from "./service.js";
import type { DiagnoseContext, DiagnosticResult } from "./types.js";

describe("computeSummaryCounts", () => {
  it("counts each status independently and rolls up total", () => {
    const results: DiagnosticResult[] = [
      { checkId: "a", status: "ok", detail: "", suggestedAction: null },
      { checkId: "b", status: "ok", detail: "", suggestedAction: null },
      { checkId: "c", status: "warn", detail: "", suggestedAction: null },
      { checkId: "d", status: "fail", detail: "", suggestedAction: null },
      { checkId: "e", status: "skip", detail: "", suggestedAction: null },
    ];
    expect(computeSummaryCounts(results)).toEqual({ ok: 2, warn: 1, fail: 1, skip: 1, total: 5 });
  });

  it("returns all-zero with total=0 for an empty result list", () => {
    expect(computeSummaryCounts([])).toEqual({ ok: 0, warn: 0, fail: 0, skip: 0, total: 0 });
  });
});

describe("runDiagnose — frozen output", () => {
  it('emits capturedAt: "<frozen>" when the context requests it', async () => {
    // Context with no clients — every live check skips, every static check
    // returns its non-network result. This deterministically exercises the
    // service's report assembly without a fetch dependency.
    const ctx: DiagnoseContext = {
      config: {},
      profile: "default",
      configPath: "/tmp/test.yaml",
      authMode: "oauth-first",
      endpoint: "https://thirdparty.qonto.com",
      stagingTokenPresent: false,
      qontoctlVersion: "0.0.0-test",
      frozenTimestamp: true,
      apiKeyClient: undefined,
      oauthClient: undefined,
      cache: new Map(),
    };
    const report = await runDiagnose(ctx);
    expect(report.capturedAt).toBe("<frozen>");
    expect(report.schemaVersion).toBe("1.0");
    expect(report.qontoctlVersion).toBe("0.0.0-test");
    // Default registry has 9 checks; with no creds, every live check skips
    // and config-resolution + auth-credentials cascade-trigger.
    expect(report.results.length).toBe(9);
    // auth-credentials must mark fail (no creds).
    const authCreds = report.results.find((r) => r.checkId === "auth.credentials-present");
    expect(authCreds?.status).toBe("fail");
  });

  it("emits an ISO-8601 capturedAt when frozen is false", async () => {
    const ctx: DiagnoseContext = {
      config: {},
      profile: "default",
      configPath: undefined,
      authMode: "oauth-first",
      endpoint: "https://thirdparty.qonto.com",
      stagingTokenPresent: false,
      qontoctlVersion: "0.0.0-test",
      frozenTimestamp: false,
      apiKeyClient: undefined,
      oauthClient: undefined,
      cache: new Map(),
    };
    const report = await runDiagnose(ctx);
    expect(report.capturedAt).not.toBe("<frozen>");
    // Should parse as a real date.
    expect(Number.isNaN(new Date(report.capturedAt).getTime())).toBe(false);
    // configPath fallback to "<env>" when undefined.
    expect(report.configPath).toBe("<env>");
  });
});
