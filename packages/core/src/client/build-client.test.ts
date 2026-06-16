// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildClientFromConfig, type BuildClientOptions } from "./build-client.js";
import type { ConfigResult, QontoctlConfig } from "../config/types.js";
import type { HttpClientOptions } from "../http-client.js";

// Mock the two core-internal collaborators whose outputs we inspect: the
// HttpClient constructor (assert on its ctor args) and the OAuth authorization
// factory (assert it is wired, and use its sentinel return as the OAuth
// authorization). Everything else — selectAuthChain, resolveAuthPreference,
// buildApiKeyAuthorization (returns the `org:key` string), resolveScaMethod,
// ConfigError — runs for real. This mirrors how the CLI's client.test.ts mocked
// the barrel before #663 moved the assembly into core.
vi.mock("../http-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../http-client.js")>();
  return { ...actual, HttpClient: vi.fn() };
});
vi.mock("../auth/oauth-authorization-factory.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/oauth-authorization-factory.js")>();
  return { ...actual, createOAuthAuthorization: vi.fn() };
});

const { HttpClient } = await import("../http-client.js");
const { createOAuthAuthorization } = await import("../auth/oauth-authorization-factory.js");
const HttpClientMock = vi.mocked(HttpClient);
const createOAuthAuthorizationMock = vi.mocked(createOAuthAuthorization);

/** Build a ConfigResult fixture around a config, with sensible defaults. */
function makeResult(config: QontoctlConfig, overrides?: Partial<ConfigResult>): ConfigResult {
  return {
    config,
    endpoint: "https://thirdparty.qonto.com",
    warnings: [],
    oauthAccessTokenFromEnv: false,
    ...overrides,
  };
}

const apiKeyCreds = { organizationSlug: "org", secretKey: "key" } as const;
const oauthCreds = {
  clientId: "client-id",
  clientSecret: "client-secret",
  accessToken: "access-token",
  accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
} as const;

function ctorArgs(): HttpClientOptions | undefined {
  return HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
}

describe("buildClientFromConfig", () => {
  const oauthAuthFn = vi.fn().mockResolvedValue("Bearer at");

  beforeEach(() => {
    vi.clearAllMocks();
    createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("constructs with the resolved endpoint", () => {
    buildClientFromConfig(makeResult({ apiKey: apiKeyCreds }));
    expect(HttpClientMock).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "https://thirdparty.qonto.com" }));
  });

  it("uses the api-key string authorization for an api-key config", () => {
    buildClientFromConfig(makeResult({ apiKey: apiKeyCreds }));
    expect(ctorArgs()?.authorization).toBe("org:key");
  });

  it("uses createOAuthAuthorization for an oauth config", () => {
    buildClientFromConfig(makeResult({ oauth: oauthCreds }));
    expect(createOAuthAuthorizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oauth: expect.objectContaining({ clientId: "client-id" }),
        tokenUrl: "https://oauth.qonto.com/oauth2/token",
      }),
    );
    expect(ctorArgs()?.authorization).toBe(oauthAuthFn);
  });

  it("routes OAuth token exchange to the sandbox token URL when a staging token is set", () => {
    buildClientFromConfig(
      makeResult(
        { oauth: { ...oauthCreds, stagingToken: "tok" } },
        { endpoint: "https://thirdparty-sandbox.staging.qonto.co" },
      ),
    );
    expect(createOAuthAuthorizationMock).toHaveBeenCalledWith(
      expect.objectContaining({ tokenUrl: "https://oauth-sandbox.staging.qonto.co/oauth2/token" }),
    );
    expect(ctorArgs()?.stagingToken).toBe("tok");
  });

  it("threads the config path and the profile override into createOAuthAuthorization", () => {
    buildClientFromConfig(makeResult({ oauth: oauthCreds }, { path: "/tmp/work.yaml" }), { profile: "work" });
    expect(createOAuthAuthorizationMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/tmp/work.yaml", profile: "work" }),
    );
  });

  it("threads readOnly from oauthAccessTokenFromEnv into createOAuthAuthorization", () => {
    buildClientFromConfig(makeResult({ oauth: oauthCreds }, { oauthAccessTokenFromEnv: true }));
    expect(createOAuthAuthorizationMock).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true }));
  });

  it("throws when no credentials are configured", () => {
    expect(() => buildClientFromConfig(makeResult({}))).toThrow("No credentials found in configuration");
    expect(HttpClientMock).not.toHaveBeenCalled();
  });

  describe("auth preference selection (4 modes × 4 credential states)", () => {
    type AuthMode = "api-key" | "api-key-first" | "oauth" | "oauth-first";
    type Setup = "both" | "api-key-only" | "oauth-only" | "none";

    interface Case {
      mode: AuthMode;
      setup: Setup;
      expect:
        | { kind: "throw" }
        | { kind: "ok"; primary: "api-key" | "oauth"; fallback: "api-key" | "oauth" | undefined; warning?: string };
    }

    const cases: readonly Case[] = [
      { mode: "api-key", setup: "both", expect: { kind: "ok", primary: "api-key", fallback: undefined } },
      { mode: "api-key", setup: "api-key-only", expect: { kind: "ok", primary: "api-key", fallback: undefined } },
      {
        mode: "api-key",
        setup: "oauth-only",
        expect: { kind: "ok", primary: "oauth", fallback: undefined, warning: "no api-key" },
      },
      { mode: "api-key", setup: "none", expect: { kind: "throw" } },
      { mode: "api-key-first", setup: "both", expect: { kind: "ok", primary: "api-key", fallback: "oauth" } },
      { mode: "api-key-first", setup: "api-key-only", expect: { kind: "ok", primary: "api-key", fallback: undefined } },
      {
        mode: "api-key-first",
        setup: "oauth-only",
        expect: { kind: "ok", primary: "oauth", fallback: undefined, warning: "no api-key" },
      },
      { mode: "api-key-first", setup: "none", expect: { kind: "throw" } },
      { mode: "oauth", setup: "both", expect: { kind: "ok", primary: "oauth", fallback: undefined } },
      {
        mode: "oauth",
        setup: "api-key-only",
        expect: { kind: "ok", primary: "api-key", fallback: undefined, warning: "no OAuth" },
      },
      { mode: "oauth", setup: "oauth-only", expect: { kind: "ok", primary: "oauth", fallback: undefined } },
      { mode: "oauth", setup: "none", expect: { kind: "throw" } },
      { mode: "oauth-first", setup: "both", expect: { kind: "ok", primary: "oauth", fallback: "api-key" } },
      {
        mode: "oauth-first",
        setup: "api-key-only",
        expect: { kind: "ok", primary: "api-key", fallback: undefined, warning: "no OAuth" },
      },
      { mode: "oauth-first", setup: "oauth-only", expect: { kind: "ok", primary: "oauth", fallback: undefined } },
      { mode: "oauth-first", setup: "none", expect: { kind: "throw" } },
    ];

    for (const c of cases) {
      it(`mode=${c.mode} setup=${c.setup} -> ${c.expect.kind === "throw" ? "throws" : `primary=${c.expect.primary} fallback=${String(c.expect.fallback)}`}`, () => {
        const warnings: string[] = [];
        const config: QontoctlConfig = {
          ...(c.setup === "both" || c.setup === "api-key-only" ? { apiKey: apiKeyCreds } : {}),
          ...(c.setup === "both" || c.setup === "oauth-only" ? { oauth: oauthCreds } : {}),
        };
        const options: BuildClientOptions = { authPreference: c.mode, onWarning: (m) => warnings.push(m) };

        if (c.expect.kind === "throw") {
          expect(() => buildClientFromConfig(makeResult(config), options)).toThrow(
            "No credentials found in configuration",
          );
          return;
        }

        buildClientFromConfig(makeResult(config), options);
        const args = ctorArgs();

        if (c.expect.primary === "oauth") {
          expect(args?.authorization).toBe(oauthAuthFn);
        } else {
          expect(args?.authorization).toBe("org:key");
        }

        if (c.expect.fallback === "oauth") {
          expect(args?.fallbackAuthorization).toBe(oauthAuthFn);
        } else if (c.expect.fallback === "api-key") {
          expect(args?.fallbackAuthorization).toBe("org:key");
        } else {
          expect(args?.fallbackAuthorization).toBeUndefined();
        }

        if (c.expect.warning !== undefined) {
          const expectedWarning = c.expect.warning;
          expect(warnings.some((m) => m.startsWith("Warning:") && m.includes(expectedWarning))).toBe(true);
        }
      });
    }
  });

  describe("auth preference precedence", () => {
    it("authPreference override beats config.auth.preference", () => {
      buildClientFromConfig(
        makeResult({ oauth: oauthCreds, apiKey: apiKeyCreds, auth: { preference: "oauth-first" } }),
        { authPreference: "api-key" },
      );
      expect(ctorArgs()?.authorization).toBe("org:key");
      expect(ctorArgs()?.fallbackAuthorization).toBeUndefined();
    });

    it("honours config.auth.preference when no override is given", () => {
      buildClientFromConfig(makeResult({ oauth: oauthCreds, apiKey: apiKeyCreds, auth: { preference: "api-key" } }));
      expect(ctorArgs()?.authorization).toBe("org:key");
      expect(ctorArgs()?.fallbackAuthorization).toBeUndefined();
    });

    it("defaults to oauth-first when both creds present and no preference set", () => {
      buildClientFromConfig(makeResult({ oauth: oauthCreds, apiKey: apiKeyCreds }));
      expect(ctorArgs()?.authorization).toBe(oauthAuthFn);
      expect(ctorArgs()?.fallbackAuthorization).toBe("org:key");
    });
  });

  describe("warning sink", () => {
    it("does not emit when no onWarning sink is provided (degrade case)", () => {
      // oauth mode + api-key-only → degrade warning, but no sink wired → no throw.
      expect(() =>
        buildClientFromConfig(makeResult({ apiKey: apiKeyCreds }), { authPreference: "oauth" }),
      ).not.toThrow();
    });

    it("emits the primary→fallback notice through onWarning", () => {
      const warnings: string[] = [];
      buildClientFromConfig(makeResult({ oauth: oauthCreds, apiKey: apiKeyCreds }), {
        authPreference: "oauth-first",
        onWarning: (m) => warnings.push(m),
      });
      const onFallback = ctorArgs()?.onFallback as (method: string, path: string) => void;
      onFallback("GET", "/v2/organizations");
      expect(warnings).toContain(
        "Warning: primary authentication failed, falling back to api-key for GET /v2/organizations\n",
      );
    });
  });

  describe("logger passthrough", () => {
    it("passes the logger through to HttpClient", () => {
      const logger = { verbose: vi.fn(), debug: vi.fn() };
      buildClientFromConfig(makeResult({ apiKey: apiKeyCreds }), { logger });
      expect(ctorArgs()?.logger).toBe(logger);
    });

    it("omits the logger when none is provided", () => {
      buildClientFromConfig(makeResult({ apiKey: apiKeyCreds }));
      expect(ctorArgs()?.logger).toBeUndefined();
    });
  });

  describe("scaMethod", () => {
    it("does not pass scaMethod by default (production, no override)", () => {
      buildClientFromConfig(makeResult({ apiKey: apiKeyCreds }));
      expect(ctorArgs()?.scaMethod).toBeUndefined();
    });

    it("forwards the scaMethodOverride", () => {
      buildClientFromConfig(makeResult({ apiKey: apiKeyCreds }), { scaMethodOverride: "passkey" });
      expect(ctorArgs()?.scaMethod).toBe("passkey");
    });

    it("forwards config.sca.method when no override", () => {
      buildClientFromConfig(makeResult({ apiKey: apiKeyCreds, sca: { method: "sms-otp" } }));
      expect(ctorArgs()?.scaMethod).toBe("sms-otp");
    });

    it("override wins over config.sca.method", () => {
      buildClientFromConfig(makeResult({ apiKey: apiKeyCreds, sca: { method: "passkey" } }), {
        scaMethodOverride: "paired-device",
      });
      expect(ctorArgs()?.scaMethod).toBe("paired-device");
    });

    it('auto-defaults to "mock" in sandbox (stagingToken set) with no override/config', () => {
      buildClientFromConfig(
        makeResult(
          { oauth: { ...oauthCreds, stagingToken: "tok" } },
          { endpoint: "https://thirdparty-sandbox.staging.qonto.co" },
        ),
      );
      expect(ctorArgs()?.scaMethod).toBe("mock");
    });

    it("does NOT auto-default in production (no stagingToken)", () => {
      buildClientFromConfig(makeResult({ oauth: oauthCreds }));
      expect(ctorArgs()?.scaMethod).toBeUndefined();
    });
  });

  describe("fatal-config guard (#631 — selectAuthChain.fatal)", () => {
    it("throws ConfigError (VALIDATION) for api-key-first + empty secret-key, before constructing a client", () => {
      const error = (() => {
        try {
          buildClientFromConfig(makeResult({ apiKey: { organizationSlug: "org", secretKey: "" }, oauth: oauthCreds }), {
            authPreference: "api-key-first",
          });
        } catch (e) {
          return e;
        }
        return undefined;
      })();
      expect((error as Error).name).toBe("ConfigError");
      expect((error as Error).message).toContain("api-key-first");
      expect((error as Error).message).toContain("empty-secret");
      expect((error as Error).message).toContain("refusing to silently fall back to OAuth");
      expect(HttpClientMock).not.toHaveBeenCalled();
    });

    it("throws ConfigError for api-key bare + empty secret-key", () => {
      expect(() =>
        buildClientFromConfig(makeResult({ apiKey: { organizationSlug: "org", secretKey: "" } }), {
          authPreference: "api-key",
        }),
      ).toThrow(/empty-secret/);
      expect(HttpClientMock).not.toHaveBeenCalled();
    });

    it("throws ConfigError for api-key-first + empty organization-slug", () => {
      expect(() =>
        buildClientFromConfig(makeResult({ apiKey: { organizationSlug: "", secretKey: "key" }, oauth: oauthCreds }), {
          authPreference: "api-key-first",
        }),
      ).toThrow(/empty-slug/);
      expect(HttpClientMock).not.toHaveBeenCalled();
    });

    it("does NOT throw ConfigError for oauth-first + invalid api-key fallback (respects the user's OAuth primary)", () => {
      // The fatal guard must NOT fire when OAuth is the explicit primary. Construction
      // still throws — but with AuthError from the eager api-key fallback build, NOT
      // ConfigError. createOAuthAuthorization is mocked (sentinel), so only the
      // real buildApiKeyAuthorization (empty secret) throws AuthError here.
      const error = (() => {
        try {
          buildClientFromConfig(makeResult({ apiKey: { organizationSlug: "org", secretKey: "" }, oauth: oauthCreds }), {
            authPreference: "oauth-first",
          });
        } catch (e) {
          return e;
        }
        return undefined;
      })();
      expect((error as Error).name).toBe("AuthError");
      expect((error as Error).name).not.toBe("ConfigError");
    });

    it("does NOT throw for a valid api-key-first config (happy-path regression guard)", () => {
      buildClientFromConfig(
        makeResult({ apiKey: { organizationSlug: "org", secretKey: "valid" }, oauth: oauthCreds }),
        {
          authPreference: "api-key-first",
        },
      );
      expect(HttpClientMock).toHaveBeenCalled();
      expect(ctorArgs()?.authorization).toBe("org:valid");
      expect(ctorArgs()?.fallbackAuthorization).toBe(oauthAuthFn);
    });
  });
});
