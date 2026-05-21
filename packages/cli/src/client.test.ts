// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { HttpClientOptions } from "@qontoctl/core";
import { createClient } from "./client.js";
import type { GlobalOptions } from "./options.js";

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    resolveConfig: vi.fn(),
    HttpClient: vi.fn(),
    createOAuthAuthorization: vi.fn(),
  };
});

const { resolveConfig, HttpClient, createOAuthAuthorization } = await import("@qontoctl/core");
const resolveConfigMock = vi.mocked(resolveConfig);
const HttpClientMock = vi.mocked(HttpClient);
const createOAuthAuthorizationMock = vi.mocked(createOAuthAuthorization);

describe("createClient", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    resolveConfigMock.mockResolvedValue({
      config: {
        apiKey: {
          organizationSlug: "test-org",
          secretKey: "test-secret",
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
      oauthAccessTokenFromEnv: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a client with resolved endpoint", async () => {
    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    expect(HttpClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://thirdparty.qonto.com",
      }),
    );
  });

  it("passes profile to resolveConfig", async () => {
    const options: GlobalOptions = { output: "table", profile: "work" };
    await createClient(options);
    expect(resolveConfigMock).toHaveBeenCalledWith({ profile: "work" });
  });

  it("prints warnings to stderr", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        apiKey: {
          organizationSlug: "test-org",
          secretKey: "test-secret",
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: ["Unknown key: foo"],
      oauthAccessTokenFromEnv: false,
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);
    expect(stderrSpy).toHaveBeenCalledWith("Warning: Unknown key: foo\n");
  });

  it("throws when config has no API key", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {},
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
      oauthAccessTokenFromEnv: false,
    });

    const options: GlobalOptions = { output: "table" };
    await expect(createClient(options)).rejects.toThrow("No credentials found in configuration");
  });

  it("creates client without logger by default", async () => {
    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    expect(ctorArgs?.logger).toBeUndefined();
  });

  it("creates a debug logger when --debug is set", async () => {
    const options: GlobalOptions = { output: "table", debug: true };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    const logger = ctorArgs?.logger;
    expect(logger).toBeDefined();

    logger?.verbose("verbose msg");
    expect(stderrSpy).toHaveBeenCalledWith("verbose msg\n");

    logger?.debug("debug msg");
    expect(stderrSpy).toHaveBeenCalledWith("debug msg\n");
  });

  it("emits a warning when --debug is set", async () => {
    const options: GlobalOptions = { output: "table", debug: true };
    await createClient(options);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Debug mode logs full API responses"));
  });

  it("does not emit debug warning when only --verbose is set", async () => {
    const options: GlobalOptions = { output: "table", verbose: true };
    await createClient(options);

    const calls = stderrSpy.mock.calls.map((call: [string]) => call[0]) as string[];
    expect(calls.every((msg) => !msg.includes("Debug mode"))).toBe(true);
  });

  it("creates a verbose-only logger when --verbose is set", async () => {
    const options: GlobalOptions = { output: "table", verbose: true };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    const logger = ctorArgs?.logger;
    expect(logger).toBeDefined();

    logger?.verbose("verbose msg");
    expect(stderrSpy).toHaveBeenCalledWith("verbose msg\n");

    stderrSpy.mockClear();
    logger?.debug("debug msg");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("uses createOAuthAuthorization when oauth config is present", async () => {
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer access-token");
    createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "access-token",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
      oauthAccessTokenFromEnv: false,
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    expect(createOAuthAuthorizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oauth: expect.objectContaining({ clientId: "client-id" }),
        tokenUrl: "https://oauth.qonto.com/oauth2/token",
      }),
    );
    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    expect(ctorArgs?.authorization).toBe(oauthAuthFn);
  });

  it("passes profile to createOAuthAuthorization", async () => {
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer token");
    createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "token",
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
      oauthAccessTokenFromEnv: false,
    });

    const options: GlobalOptions = { output: "table", profile: "work" };
    await createClient(options);

    expect(createOAuthAuthorizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: "work",
      }),
    );
  });

  it("passes API key as fallback authorization when OAuth is primary and API key exists", async () => {
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer access-token");
    createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "access-token",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        apiKey: {
          organizationSlug: "org",
          secretKey: "key",
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
      oauthAccessTokenFromEnv: false,
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    expect(ctorArgs?.fallbackAuthorization).toBeDefined();
    expect(typeof ctorArgs?.onFallback).toBe("function");
  });

  it("does not set fallback authorization when only OAuth is configured", async () => {
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer access-token");
    createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "access-token",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
      oauthAccessTokenFromEnv: false,
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    expect(ctorArgs?.fallbackAuthorization).toBeUndefined();
  });

  it("does not set fallback authorization when only API key is configured", async () => {
    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    expect(ctorArgs?.fallbackAuthorization).toBeUndefined();
  });

  it("writes warning to stderr on fallback", async () => {
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer access-token");
    createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "access-token",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        apiKey: {
          organizationSlug: "org",
          secretKey: "key",
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
      oauthAccessTokenFromEnv: false,
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    const onFallback = ctorArgs?.onFallback as (method: string, path: string) => void;
    onFallback("GET", "/v2/organizations");

    expect(stderrSpy).toHaveBeenCalledWith(
      "Warning: primary authentication failed, falling back to api-key for GET /v2/organizations\n",
    );
  });

  describe("auth preference selection (4 modes × 4 credential states)", () => {
    const apiKeyCreds = { organizationSlug: "org", secretKey: "key" } as const;
    const oauthCreds = {
      clientId: "client-id",
      clientSecret: "client-secret",
      accessToken: "access-token",
      accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    } as const;
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer at");

    type AuthMode = "api-key" | "api-key-first" | "oauth" | "oauth-first";
    type Setup = "both" | "api-key-only" | "oauth-only" | "none";

    interface Case {
      mode: AuthMode;
      setup: Setup;
      expect:
        | { kind: "throw" }
        | {
            kind: "ok";
            primary: "api-key" | "oauth";
            fallback: "api-key" | "oauth" | undefined;
            warning?: string;
          };
    }

    const cases: readonly Case[] = [
      // api-key mode (no fallback)
      { mode: "api-key", setup: "both", expect: { kind: "ok", primary: "api-key", fallback: undefined } },
      { mode: "api-key", setup: "api-key-only", expect: { kind: "ok", primary: "api-key", fallback: undefined } },
      {
        mode: "api-key",
        setup: "oauth-only",
        expect: { kind: "ok", primary: "oauth", fallback: undefined, warning: "no api-key" },
      },
      { mode: "api-key", setup: "none", expect: { kind: "throw" } },
      // api-key-first mode
      { mode: "api-key-first", setup: "both", expect: { kind: "ok", primary: "api-key", fallback: "oauth" } },
      {
        mode: "api-key-first",
        setup: "api-key-only",
        expect: { kind: "ok", primary: "api-key", fallback: undefined },
      },
      {
        mode: "api-key-first",
        setup: "oauth-only",
        expect: { kind: "ok", primary: "oauth", fallback: undefined, warning: "no api-key" },
      },
      { mode: "api-key-first", setup: "none", expect: { kind: "throw" } },
      // oauth mode (no fallback)
      { mode: "oauth", setup: "both", expect: { kind: "ok", primary: "oauth", fallback: undefined } },
      {
        mode: "oauth",
        setup: "api-key-only",
        expect: { kind: "ok", primary: "api-key", fallback: undefined, warning: "no OAuth" },
      },
      { mode: "oauth", setup: "oauth-only", expect: { kind: "ok", primary: "oauth", fallback: undefined } },
      { mode: "oauth", setup: "none", expect: { kind: "throw" } },
      // oauth-first mode (default)
      { mode: "oauth-first", setup: "both", expect: { kind: "ok", primary: "oauth", fallback: "api-key" } },
      {
        mode: "oauth-first",
        setup: "api-key-only",
        expect: { kind: "ok", primary: "api-key", fallback: undefined, warning: "no OAuth" },
      },
      {
        mode: "oauth-first",
        setup: "oauth-only",
        expect: { kind: "ok", primary: "oauth", fallback: undefined },
      },
      { mode: "oauth-first", setup: "none", expect: { kind: "throw" } },
    ];

    for (const c of cases) {
      it(`mode=${c.mode} setup=${c.setup} -> ${c.expect.kind === "throw" ? "throws" : `primary=${c.expect.primary} fallback=${String(c.expect.fallback)}`}`, async () => {
        createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
        resolveConfigMock.mockResolvedValue({
          config: {
            ...(c.setup === "both" || c.setup === "api-key-only" ? { apiKey: apiKeyCreds } : {}),
            ...(c.setup === "both" || c.setup === "oauth-only" ? { oauth: oauthCreds } : {}),
          },
          endpoint: "https://thirdparty.qonto.com",
          warnings: [],
          oauthAccessTokenFromEnv: false,
        });

        const options: GlobalOptions = { output: "table", auth: c.mode };

        if (c.expect.kind === "throw") {
          await expect(createClient(options)).rejects.toThrow("No credentials found in configuration");
          return;
        }

        await createClient(options);

        const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;

        // Primary authorization assertion
        if (c.expect.primary === "oauth") {
          // OAuth primary: authorization is the mock function returned by createOAuthAuthorization
          expect(ctorArgs?.authorization).toBe(oauthAuthFn);
        } else {
          // api-key primary: authorization is a string of form `org:key`
          expect(ctorArgs?.authorization).toBe("org:key");
        }

        // Fallback authorization assertion
        if (c.expect.fallback === "oauth") {
          expect(ctorArgs?.fallbackAuthorization).toBe(oauthAuthFn);
        } else if (c.expect.fallback === "api-key") {
          expect(ctorArgs?.fallbackAuthorization).toBe("org:key");
        } else {
          expect(ctorArgs?.fallbackAuthorization).toBeUndefined();
        }

        // Warning assertion (degrade cases) — match the specific substring from
        // the fixture (`"no api-key"` / `"no OAuth"`), not just any warning,
        // so each case verifies the *correct* degrade message reaches stderr.
        if (c.expect.warning !== undefined) {
          const expectedWarning = c.expect.warning;
          const warningCalls = stderrSpy.mock.calls.map((call: [string]) => call[0]) as string[];
          const sawWarning = warningCalls.some((msg) => msg.startsWith("Warning:") && msg.includes(expectedWarning));
          expect(sawWarning).toBe(true);
        }
      });
    }
  });

  describe("auth preference precedence", () => {
    it("--auth flag overrides config.auth.preference", async () => {
      const oauthAuthFn = vi.fn().mockResolvedValue("Bearer at");
      createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "client-id",
            clientSecret: "client-secret",
            accessToken: "access-token",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
          apiKey: { organizationSlug: "org", secretKey: "key" },
          auth: { preference: "oauth-first" },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      // Flag picks api-key, overriding config's oauth-first
      const options: GlobalOptions = { output: "table", auth: "api-key" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.authorization).toBe("org:key");
      expect(ctorArgs?.fallbackAuthorization).toBeUndefined();
    });

    it("config.auth.preference is honored when no flag is set", async () => {
      const oauthAuthFn = vi.fn().mockResolvedValue("Bearer at");
      createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "client-id",
            clientSecret: "client-secret",
            accessToken: "access-token",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
          apiKey: { organizationSlug: "org", secretKey: "key" },
          auth: { preference: "api-key" },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.authorization).toBe("org:key");
      expect(ctorArgs?.fallbackAuthorization).toBeUndefined();
    });

    it("default mode (no flag, no config) is oauth-first when both creds present", async () => {
      // This covers AC: "Default behavior unchanged: when both creds present and
      // no preference set, effective mode is oauth-first"
      const oauthAuthFn = vi.fn().mockResolvedValue("Bearer at");
      createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "client-id",
            clientSecret: "client-secret",
            accessToken: "access-token",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
          apiKey: { organizationSlug: "org", secretKey: "key" },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.authorization).toBe(oauthAuthFn);
      expect(ctorArgs?.fallbackAuthorization).toBe("org:key");
    });
  });

  describe("scaMethod plumbing", () => {
    it("does not pass scaMethod by default (production, no override)", async () => {
      const options: GlobalOptions = { output: "table" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.scaMethod).toBeUndefined();
    });

    it("forwards --sca-method flag value to HttpClient", async () => {
      const options: GlobalOptions = { output: "table", scaMethod: "passkey" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.scaMethod).toBe("passkey");
    });

    it("forwards config.sca.method when no flag override", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          apiKey: { organizationSlug: "org", secretKey: "secret" },
          sca: { method: "sms-otp" },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.scaMethod).toBe("sms-otp");
    });

    it("--sca-method flag wins over config.sca.method", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          apiKey: { organizationSlug: "org", secretKey: "secret" },
          sca: { method: "passkey" },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table", scaMethod: "paired-device" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.scaMethod).toBe("paired-device");
    });

    it('auto-defaults to "mock" when sandbox (stagingToken set) and no override or config', async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "at",
            stagingToken: "tok_sandbox",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        },
        endpoint: "https://thirdparty-sandbox.staging.qonto.co",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.scaMethod).toBe("mock");
    });

    it("config.sca.method wins over sandbox auto-default", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "at",
            stagingToken: "tok_sandbox",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
          sca: { method: "passkey" },
        },
        endpoint: "https://thirdparty-sandbox.staging.qonto.co",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.scaMethod).toBe("passkey");
    });

    it("--sca-method flag wins over sandbox auto-default", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "at",
            stagingToken: "tok_sandbox",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        },
        endpoint: "https://thirdparty-sandbox.staging.qonto.co",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table", scaMethod: "paired-device" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.scaMethod).toBe("paired-device");
    });

    it("does NOT auto-default in production (no stagingToken)", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "at",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table" };
      await createClient(options);

      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.scaMethod).toBeUndefined();
    });
  });

  describe("fatal-config guard (#631 PR2 — selectAuthChain.fatal)", () => {
    // In production `resolveConfig` rejects empty `organization-slug` /
    // `secret-key` at config-load time before `selectAuthChain` runs.
    // These tests bypass resolveConfig (it is mocked) to verify the
    // defense-in-depth path in createClient: when the matrix flags a
    // fatal configuration, createClient MUST throw ConfigError BEFORE
    // any HttpClient is constructed, and NO fallback authorization is
    // wired (the security-architect invariant — no silent OAuth fallback
    // on an explicit api-key-first failure).

    it("throws ConfigError with VALIDATION code when api-key-first selected + empty secret-key (AC-3)", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          apiKey: { organizationSlug: "org", secretKey: "" },
          oauth: {
            clientId: "client-id",
            clientSecret: "client-secret",
            accessToken: "access-token",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table", auth: "api-key-first" };
      const error = await createClient(options).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe("ConfigError");
      expect((error as Error).message).toContain("api-key-first");
      expect((error as Error).message).toContain("empty-secret");
      expect((error as Error).message).toContain("refusing to silently fall back to OAuth");
      // Critically: HttpClient was NOT constructed — fallback to OAuth
      // never got wired (the invariant the test exists to guard).
      expect(HttpClientMock).not.toHaveBeenCalled();
    });

    it("throws ConfigError for api-key bare + empty secret-key", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          apiKey: { organizationSlug: "org", secretKey: "" },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table", auth: "api-key" };
      const error = await createClient(options).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe("ConfigError");
      expect((error as Error).message).toContain('"api-key"');
      expect((error as Error).message).toContain("empty-secret");
      expect(HttpClientMock).not.toHaveBeenCalled();
    });

    it("throws ConfigError for api-key-first + empty organization-slug", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          apiKey: { organizationSlug: "", secretKey: "key" },
          oauth: {
            clientId: "client-id",
            clientSecret: "client-secret",
            accessToken: "access-token",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table", auth: "api-key-first" };
      const error = await createClient(options).catch((e: unknown) => e);

      expect((error as Error).name).toBe("ConfigError");
      expect((error as Error).message).toContain("empty-slug");
      expect(HttpClientMock).not.toHaveBeenCalled();
    });

    it("does NOT throw ConfigError for oauth-first + invalid api-key fallback (fatal? does not fire — user's primary is OAuth)", async () => {
      // The fatal guard MUST NOT fire when the user explicitly chose OAuth
      // as primary. An api-key configuration issue (in what is at most the
      // fallback slot) is not fatal to a request flow whose primary
      // credential is OAuth — the invariant is "respect the user's
      // explicit primary."
      //
      // NOTE: createClient WILL still throw, but with AuthError (from the
      // eager `buildApiKeyAuthorization` for the fallback slot), NOT with
      // ConfigError. This is the existing pre-#631 behavior — we are NOT
      // changing it. The point of this test is the discriminator: a
      // ConfigError (from `selection.fatal`) would indicate the security-
      // architect invariant fired spuriously for an oauth-first scenario,
      // which would be a regression.
      //
      // In production this scenario is unreachable because resolveConfig
      // rejects empty api-key fields at config-load time before
      // selectAuthChain runs; the test bypasses that via the mock.
      const oauthAuthFn = vi.fn().mockResolvedValue("Bearer at");
      createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
      resolveConfigMock.mockResolvedValue({
        config: {
          apiKey: { organizationSlug: "org", secretKey: "" },
          oauth: {
            clientId: "client-id",
            clientSecret: "client-secret",
            accessToken: "access-token",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table", auth: "oauth-first" };
      const error = await createClient(options).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      // CRITICAL discriminator: AuthError (existing pre-#631 path), NOT
      // ConfigError (which would indicate the fatal-config guard fired
      // spuriously for an oauth-first user).
      expect((error as Error).name).toBe("AuthError");
      expect((error as Error).name).not.toBe("ConfigError");
    });

    it("does NOT throw for valid api-key-first config (regression guard for the happy path)", async () => {
      // Sanity check: the fatal guard fires ONLY when apiKeyInvalidReason
      // is set. The standard api-key-first happy path must not regress.
      const oauthAuthFn = vi.fn().mockResolvedValue("Bearer at");
      createOAuthAuthorizationMock.mockReturnValue(oauthAuthFn);
      resolveConfigMock.mockResolvedValue({
        config: {
          apiKey: { organizationSlug: "org", secretKey: "valid-secret" },
          oauth: {
            clientId: "client-id",
            clientSecret: "client-secret",
            accessToken: "access-token",
            accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
        oauthAccessTokenFromEnv: false,
      });

      const options: GlobalOptions = { output: "table", auth: "api-key-first" };
      await createClient(options); // does NOT throw

      expect(HttpClientMock).toHaveBeenCalled();
      const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
      expect(ctorArgs?.authorization).toBe("org:valid-secret");
      expect(ctorArgs?.fallbackAuthorization).toBe(oauthAuthFn);
    });
  });
});
