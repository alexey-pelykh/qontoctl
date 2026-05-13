// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import type { AuthPreference, QontoctlConfig } from "../config/types.js";
import { HttpClient } from "../http-client.js";
import { runChecks } from "./runner.js";
import type { DiagnoseContext, DiagnosticCheck, DiagnosticResult } from "./types.js";

function buildContext(overrides: Partial<DiagnoseContext> = {}): DiagnoseContext {
  const config: QontoctlConfig = {
    apiKey: { organizationSlug: "slug", secretKey: "secret" },
  };
  const authMode: AuthPreference = "api-key";
  return {
    config,
    profile: "default",
    configPath: "/tmp/test.yaml",
    authMode,
    endpoint: "https://thirdparty.qonto.com",
    stagingTokenPresent: false,
    qontoctlVersion: "0.0.0-test",
    frozenTimestamp: true,
    apiKeyClient: new HttpClient({ baseUrl: "https://thirdparty.qonto.com", authorization: "slug:secret" }),
    oauthClient: undefined,
    cache: new Map(),
    ...overrides,
  };
}

function staticOk(id: string, redactionFields: readonly string[] = []): DiagnosticCheck {
  return {
    id,
    name: id,
    kind: "static",
    requiresAuth: "none",
    requiresStagingToken: false,
    redactionFields,
    run: (): Promise<DiagnosticResult> =>
      Promise.resolve({ checkId: id, status: "ok", detail: "ok", suggestedAction: null }),
  };
}

function staticFailCascade(id: string): DiagnosticCheck {
  return {
    id,
    name: id,
    kind: "static",
    requiresAuth: "none",
    requiresStagingToken: false,
    redactionFields: [],
    cascadeOnFail: true,
    run: (): Promise<DiagnosticResult> =>
      Promise.resolve({ checkId: id, status: "fail", detail: "fatal", suggestedAction: null }),
  };
}

function liveCheck(
  id: string,
  requiresAuth: DiagnosticCheck["requiresAuth"] = "either",
  requiresStagingToken = false,
): DiagnosticCheck {
  return {
    id,
    name: id,
    kind: "live",
    requiresAuth,
    requiresStagingToken,
    redactionFields: ["status_code"],
    run: (): Promise<DiagnosticResult> =>
      Promise.resolve({
        checkId: id,
        status: "ok",
        detail: "200 OK",
        suggestedAction: null,
        evidence: { status_code: 200, leaked_iban: "FR7612345987650123456789012" },
      }),
  };
}

describe("runChecks — cascade", () => {
  it("skips subsequent live checks when a cascadeOnFail check returns fail", async () => {
    const registry = [
      staticFailCascade("config.resolution"),
      liveCheck("auth.api-key-health"),
      staticOk("static.late"),
    ];
    const results = await runChecks(registry, buildContext());
    expect(results).toHaveLength(3);
    expect(results[0]?.status).toBe("fail");
    expect(results[1]?.status).toBe("skip");
    expect(results[1]?.detail).toContain("previous fatal failure");
    // Static checks after a cascade-trigger still run — they don't hit the network.
    expect(results[2]?.status).toBe("ok");
  });

  it("does NOT cascade when a non-cascading check returns fail", async () => {
    const cascadeIgnored: DiagnosticCheck = {
      id: "static.warns",
      name: "static.warns",
      kind: "static",
      requiresAuth: "none",
      requiresStagingToken: false,
      redactionFields: [],
      run: (): Promise<DiagnosticResult> =>
        Promise.resolve({ checkId: "static.warns", status: "fail", detail: "non-fatal", suggestedAction: null }),
    };
    const registry = [cascadeIgnored, liveCheck("live.runs-anyway")];
    const results = await runChecks(registry, buildContext());
    expect(results[0]?.status).toBe("fail");
    expect(results[1]?.status).toBe("ok");
  });
});

describe("runChecks — auth-aware skip", () => {
  it("skips a live check requiring oauth when only api-key is configured", async () => {
    const registry = [liveCheck("oauth-only", "oauth")];
    const results = await runChecks(registry, buildContext({ oauthClient: undefined }));
    expect(results[0]?.status).toBe("skip");
    expect(results[0]?.detail).toBe("oauth authentication not configured");
  });

  it("runs a live check requiring api-key when api-key is configured", async () => {
    const registry = [liveCheck("api-key-only", "api-key")];
    const results = await runChecks(registry, buildContext());
    expect(results[0]?.status).toBe("ok");
  });
});

describe("runChecks — staging-token gate", () => {
  it("skips checks requiring a staging-token when none is present", async () => {
    const registry = [liveCheck("needs-staging", "either", true)];
    const results = await runChecks(registry, buildContext({ stagingTokenPresent: false }));
    expect(results[0]?.status).toBe("skip");
    expect(results[0]?.detail).toBe("staging-token not configured");
  });

  it("runs a staging-required check when staging-token is present", async () => {
    const registry = [liveCheck("needs-staging", "either", true)];
    const results = await runChecks(registry, buildContext({ stagingTokenPresent: true }));
    expect(results[0]?.status).toBe("ok");
  });
});

describe("runChecks — error catching and evidence redaction", () => {
  it("catches a thrown error from check.run and converts it to a fail result", async () => {
    const throwing: DiagnosticCheck = {
      id: "throws",
      name: "throws",
      kind: "static",
      requiresAuth: "none",
      requiresStagingToken: false,
      redactionFields: [],
      run: () => Promise.reject(new Error("boom")),
    };
    const results = await runChecks([throwing], buildContext());
    expect(results[0]?.status).toBe("fail");
    expect(results[0]?.detail).toContain("internal error");
    expect(results[0]?.detail).toContain("boom");
    expect(results[0]?.suggestedAction).toContain("Report this as a bug");
  });

  it("strips evidence fields not in the check's redactionFields whitelist", async () => {
    const registry = [liveCheck("with-evidence")];
    const results = await runChecks(registry, buildContext());
    // liveCheck's evidence has both status_code (whitelisted) and
    // leaked_iban (NOT whitelisted) — only status_code should survive.
    expect(results[0]?.evidence).toEqual({ status_code: 200 });
    expect(results[0]?.evidence).not.toHaveProperty("leaked_iban");
  });
});
