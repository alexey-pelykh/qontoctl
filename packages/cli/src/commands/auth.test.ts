// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

const CANCEL_SYMBOL = Symbol("cancel");
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  text: vi.fn(),
  multiselect: vi.fn(),
  isCancel: (value: unknown) => value === CANCEL_SYMBOL,
}));

type HttpHandler = (req: { url?: string }, res: Record<string, unknown>) => void;
const { httpHandler, mockHttpServerClose, mockHttpServerListen, mockExec, MOCK_STATE_HEX } = vi.hoisted(() => ({
  httpHandler: { current: undefined as HttpHandler | undefined },
  mockHttpServerClose: vi.fn(),
  mockHttpServerListen: vi.fn(),
  mockExec: vi.fn(),
  MOCK_STATE_HEX: "a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8",
}));
vi.mock("node:http", () => ({
  createServer: vi.fn((handler: HttpHandler) => {
    httpHandler.current = handler;
    return { listen: mockHttpServerListen, close: mockHttpServerClose };
  }),
}));
vi.mock("node:child_process", () => ({
  exec: mockExec,
}));
vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => Buffer.from(MOCK_STATE_HEX, "hex")),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    resolveConfig: vi.fn(),
    refreshAccessToken: vi.fn(),
    revokeToken: vi.fn(),
    saveOAuthTokens: vi.fn(),
    saveOAuthClientCredentials: vi.fn(),
    saveOAuthScopes: vi.fn(),
    clearOAuthTokens: vi.fn(),
    generateCodeVerifier: vi.fn(),
    generateCodeChallenge: vi.fn(),
    exchangeCode: vi.fn(),
  };
});

const {
  resolveConfig,
  refreshAccessToken,
  revokeToken,
  saveOAuthTokens,
  saveOAuthClientCredentials,
  saveOAuthScopes,
  clearOAuthTokens,
  generateCodeVerifier,
  generateCodeChallenge,
  exchangeCode,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
} = await import("@qontoctl/core");
const resolveConfigMock = vi.mocked(resolveConfig);
const refreshAccessTokenMock = vi.mocked(refreshAccessToken);
const revokeTokenMock = vi.mocked(revokeToken);
const saveOAuthTokensMock = vi.mocked(saveOAuthTokens);
const saveOAuthClientCredentialsMock = vi.mocked(saveOAuthClientCredentials);
const saveOAuthScopesMock = vi.mocked(saveOAuthScopes);
const clearOAuthTokensMock = vi.mocked(clearOAuthTokens);
const generateCodeVerifierMock = vi.mocked(generateCodeVerifier);
const generateCodeChallengeMock = vi.mocked(generateCodeChallenge);
const exchangeCodeMock = vi.mocked(exchangeCode);

const { intro, outro, cancel: clackCancel, text, multiselect } = await import("@clack/prompts");
const introMock = vi.mocked(intro);
const outroMock = vi.mocked(outro);
const textMock = vi.mocked(text);
const multiselectMock = vi.mocked(multiselect);
const cancelMock = vi.mocked(clackCancel);

import { registerAuthCommands } from "./auth.js";

describe("registerAuthCommands", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers auth command group with subcommands", () => {
    const program = new Command();
    registerAuthCommands(program);

    const auth = program.commands.find((c) => c.name() === "auth");
    expect(auth).toBeDefined();

    const subcommands = auth?.commands.map((c) => c.name());
    expect(subcommands).toContain("setup");
    expect(subcommands).toContain("login");
    expect(subcommands).toContain("refresh");
    expect(subcommands).toContain("status");
    expect(subcommands).toContain("revoke");
  });

  describe("auth setup", () => {
    beforeEach(() => {
      resolveConfigMock.mockResolvedValue({
        config: {},
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });
      saveOAuthClientCredentialsMock.mockResolvedValue(undefined);
      saveOAuthScopesMock.mockResolvedValue(undefined);
    });

    it("saves client credentials and scopes successfully", async () => {
      textMock.mockResolvedValueOnce("my-client-id").mockResolvedValueOnce("my-client-secret");
      multiselectMock.mockResolvedValueOnce(["offline_access", "organization.read"]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      expect(introMock).toHaveBeenCalledWith("OAuth Setup");
      expect(saveOAuthClientCredentialsMock).toHaveBeenCalledWith(
        { clientId: "my-client-id", clientSecret: "my-client-secret" },
        undefined,
      );
      expect(saveOAuthScopesMock).toHaveBeenCalledWith(["offline_access", "organization.read"], undefined);
      expect(outroMock).toHaveBeenCalled();
    });

    it("trims whitespace from credential inputs", async () => {
      textMock.mockResolvedValueOnce("  spaced-id  ").mockResolvedValueOnce("  spaced-secret  ");
      multiselectMock.mockResolvedValueOnce(["offline_access"]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      expect(saveOAuthClientCredentialsMock).toHaveBeenCalledWith(
        { clientId: "spaced-id", clientSecret: "spaced-secret" },
        undefined,
      );
    });

    it("uses existing credentials as defaults on re-run", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "existing-id",
            clientSecret: "existing-secret",
            scopes: ["offline_access", "organization.read"],
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });
      textMock.mockResolvedValueOnce("existing-id").mockResolvedValueOnce("existing-secret");
      multiselectMock.mockResolvedValueOnce(["offline_access", "organization.read"]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      expect(textMock).toHaveBeenCalledWith(expect.objectContaining({ initialValue: "existing-id" }));
      expect(textMock).toHaveBeenCalledWith(expect.objectContaining({ initialValue: "existing-secret" }));
      expect(multiselectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          initialValues: ["offline_access", "organization.read"],
        }),
      );
    });

    it("defaults all scopes selected when no existing scopes", async () => {
      textMock.mockResolvedValueOnce("id").mockResolvedValueOnce("secret");
      multiselectMock.mockResolvedValueOnce(["offline_access"]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      const multiselectCall = multiselectMock.mock.calls[0]?.[0] as { initialValues?: string[] } | undefined;
      expect(multiselectCall?.initialValues).toHaveLength(16);
    });

    it("ensures offline_access is always included in saved scopes", async () => {
      textMock.mockResolvedValueOnce("id").mockResolvedValueOnce("secret");
      multiselectMock.mockResolvedValueOnce(["organization.read"]); // offline_access deselected

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      expect(saveOAuthScopesMock).toHaveBeenCalledWith(["offline_access", "organization.read"], undefined);
    });

    it("provides scope descriptions as hints", async () => {
      textMock.mockResolvedValueOnce("id").mockResolvedValueOnce("secret");
      multiselectMock.mockResolvedValueOnce(["offline_access"]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      const multiselectCall = multiselectMock.mock.calls[0]?.[0] as
        | { options?: { value: string; hint?: string }[] }
        | undefined;
      const orgOption = multiselectCall?.options?.find((o) => o.value === "organization.read");
      expect(orgOption?.hint).toContain("Organization");
      const offlineOption = multiselectCall?.options?.find((o) => o.value === "offline_access");
      expect(offlineOption?.hint).toContain("required");
    });

    it("exits cleanly when Client ID is cancelled", async () => {
      textMock.mockResolvedValueOnce(CANCEL_SYMBOL);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      expect(cancelMock).toHaveBeenCalledWith("Setup cancelled.");
      expect(saveOAuthClientCredentialsMock).not.toHaveBeenCalled();
      expect(saveOAuthScopesMock).not.toHaveBeenCalled();
    });

    it("exits cleanly when Client Secret is cancelled", async () => {
      textMock.mockResolvedValueOnce("my-id").mockResolvedValueOnce(CANCEL_SYMBOL);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      expect(cancelMock).toHaveBeenCalledWith("Setup cancelled.");
      expect(saveOAuthClientCredentialsMock).not.toHaveBeenCalled();
      expect(saveOAuthScopesMock).not.toHaveBeenCalled();
    });

    it("exits cleanly when scope selection is cancelled", async () => {
      textMock.mockResolvedValueOnce("my-id").mockResolvedValueOnce("my-secret");
      multiselectMock.mockResolvedValueOnce(CANCEL_SYMBOL);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      expect(cancelMock).toHaveBeenCalledWith("Setup cancelled.");
      expect(saveOAuthClientCredentialsMock).not.toHaveBeenCalled();
      expect(saveOAuthScopesMock).not.toHaveBeenCalled();
    });

    it("passes profile option when specified", async () => {
      textMock.mockResolvedValueOnce("my-id").mockResolvedValueOnce("my-secret");
      multiselectMock.mockResolvedValueOnce(["offline_access"]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.option("-p, --profile <name>", "");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup", "--profile", "work"], { from: "user" });

      expect(saveOAuthClientCredentialsMock).toHaveBeenCalledWith(
        { clientId: "my-id", clientSecret: "my-secret" },
        { profile: "work" },
      );
      expect(saveOAuthScopesMock).toHaveBeenCalledWith(["offline_access"], { profile: "work" });
    });
  });

  describe("auth status", () => {
    it("shows not logged in when no access token", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: { clientId: "cid", clientSecret: "csecret" },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "status"], { from: "user" });

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Not logged in");
    });

    it("shows active status with expiration", async () => {
      const future = new Date(Date.now() + 7200_000).toISOString(); // 2 hours from now
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "token",
            refreshToken: "refresh",
            accessTokenExpiresAt: future,
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "status"], { from: "user" });

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Status: Active");
      expect(output).toContain("Remaining:");
      expect(output).toContain("Refresh token: Available");
    });

    it("shows expired status", async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "token",
            accessTokenExpiresAt: past,
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "status"], { from: "user" });

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Status: Expired");
      expect(output).toContain("Refresh token: Not available");
    });

    it("shows active with no expiration info", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "token",
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "status"], { from: "user" });

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Status: Active (no expiration info)");
    });

    it("shows remaining time in minutes when less than an hour", async () => {
      const future = new Date(Date.now() + 1800_000).toISOString(); // 30 min from now
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "token",
            accessTokenExpiresAt: future,
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "status"], { from: "user" });

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toMatch(/Remaining: \d+m/);
      expect(output).not.toMatch(/Remaining: \d+h/);
    });

    it("throws when no OAuth config", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {},
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      await expect(program.parseAsync(["auth", "status"], { from: "user" })).rejects.toThrow(
        "No OAuth credentials found",
      );
    });
  });

  describe("auth refresh", () => {
    it("refreshes tokens successfully", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            refreshToken: "old-refresh",
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });
      refreshAccessTokenMock.mockResolvedValue({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresIn: 3600,
        tokenType: "Bearer",
      });
      saveOAuthTokensMock.mockResolvedValue(undefined);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "refresh"], { from: "user" });

      expect(refreshAccessTokenMock).toHaveBeenCalled();
      expect(saveOAuthTokensMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "new-access",
          refreshToken: "new-refresh",
        }),
        undefined,
      );
      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Access token refreshed successfully");
    });

    it("keeps existing refresh token when new one is not provided", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            refreshToken: "existing-refresh",
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });
      refreshAccessTokenMock.mockResolvedValue({
        accessToken: "new-access",
        expiresIn: 3600,
        tokenType: "Bearer",
      });
      saveOAuthTokensMock.mockResolvedValue(undefined);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "refresh"], { from: "user" });

      expect(saveOAuthTokensMock).toHaveBeenCalledWith(
        expect.objectContaining({
          refreshToken: "existing-refresh",
        }),
        undefined,
      );
    });

    it("throws when no refresh token available", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      await expect(program.parseAsync(["auth", "refresh"], { from: "user" })).rejects.toThrow(
        "No refresh token available",
      );
    });

    it("uses sandbox token URL when sandbox is configured", async () => {
      const { OAUTH_TOKEN_SANDBOX_URL } = await import("@qontoctl/core");
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            refreshToken: "refresh",
          },
          sandbox: true,
        },
        endpoint: "https://thirdparty-sandbox.staging.qonto.co",
        warnings: [],
      });
      refreshAccessTokenMock.mockResolvedValue({
        accessToken: "new-access",
        expiresIn: 3600,
        tokenType: "Bearer",
      });
      saveOAuthTokensMock.mockResolvedValue(undefined);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "refresh"], { from: "user" });

      expect(refreshAccessTokenMock).toHaveBeenCalledWith(OAUTH_TOKEN_SANDBOX_URL, "cid", "csecret", "refresh");
    });
  });

  describe("auth revoke", () => {
    it("revokes both access and refresh tokens", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "access",
            refreshToken: "refresh",
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });
      revokeTokenMock.mockResolvedValue(undefined);
      clearOAuthTokensMock.mockResolvedValue(undefined);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "revoke"], { from: "user" });

      expect(revokeTokenMock).toHaveBeenCalledTimes(2);
      expect(clearOAuthTokensMock).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("OAuth tokens revoked and cleared");
    });

    it("continues when access token revocation fails", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "access",
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });
      revokeTokenMock.mockRejectedValue(new Error("revoke failed"));
      clearOAuthTokensMock.mockResolvedValue(undefined);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "revoke"], { from: "user" });

      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Warning: Failed to revoke access token");
      expect(clearOAuthTokensMock).toHaveBeenCalled();
    });

    it("continues when refresh token revocation fails", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            refreshToken: "refresh",
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });
      revokeTokenMock.mockRejectedValue(new Error("revoke failed"));
      clearOAuthTokensMock.mockResolvedValue(undefined);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "revoke"], { from: "user" });

      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Warning: Failed to revoke refresh token");
      expect(clearOAuthTokensMock).toHaveBeenCalled();
    });

    it("clears tokens even when no tokens to revoke", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });
      clearOAuthTokensMock.mockResolvedValue(undefined);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "revoke"], { from: "user" });

      expect(revokeTokenMock).not.toHaveBeenCalled();
      expect(clearOAuthTokensMock).toHaveBeenCalled();
    });
  });

  describe("auth login", () => {
    const defaultOAuthConfig = {
      config: {
        oauth: { clientId: "test-client-id", clientSecret: "test-client-secret" },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [] as string[],
    };

    const defaultTokenResponse = {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 3600,
      tokenType: "Bearer",
    };

    function callHandler(req: { url?: string }, res: Record<string, unknown>): void {
      const handler = httpHandler.current;
      expect(handler).toBeDefined();
      if (handler === undefined) throw new Error("unreachable");
      handler(req, res);
    }

    function simulateCallback(code: string, state: string): void {
      callHandler({ url: `/callback?code=${code}&state=${state}` }, { writeHead: vi.fn(), end: vi.fn() });
    }

    function simulateCallbackError(error: string, description?: string): void {
      const params = new URLSearchParams({ error });
      if (description !== undefined) params.set("error_description", description);
      callHandler({ url: `/callback?${params.toString()}` }, { writeHead: vi.fn(), end: vi.fn() });
    }

    function simulateCallbackMissingParams(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
      const mockRes = { writeHead: vi.fn(), end: vi.fn() };
      callHandler({ url: "/callback" }, mockRes);
      return mockRes;
    }

    beforeEach(() => {
      httpHandler.current = undefined;
      mockHttpServerListen.mockImplementation((_port: number, _host: string, cb: () => void) => {
        cb();
      });
      resolveConfigMock.mockResolvedValue(defaultOAuthConfig);
      generateCodeVerifierMock.mockReturnValue("test-code-verifier");
      generateCodeChallengeMock.mockReturnValue("test-code-challenge");
      exchangeCodeMock.mockResolvedValue(defaultTokenResponse);
      saveOAuthTokensMock.mockResolvedValue(undefined);
    });

    it("generates PKCE values and exchanges code for tokens", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      expect(generateCodeVerifierMock).toHaveBeenCalled();
      expect(generateCodeChallengeMock).toHaveBeenCalledWith("test-code-verifier");
      expect(exchangeCodeMock).toHaveBeenCalledWith(
        OAUTH_TOKEN_URL,
        "test-client-id",
        "test-client-secret",
        "auth-code",
        "http://localhost:18920/callback",
        "test-code-verifier",
      );
    });

    it("saves tokens with correct expiration calculation", async () => {
      const mockNow = new Date("2026-03-23T12:00:00.000Z").getTime();
      vi.spyOn(Date, "now").mockReturnValue(mockNow);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      expect(saveOAuthTokensMock).toHaveBeenCalledWith(
        {
          accessToken: "new-access-token",
          refreshToken: "new-refresh-token",
          accessTokenExpiresAt: "2026-03-23T13:00:00.000Z",
        },
        undefined,
      );
    });

    it("throws on state mismatch (CSRF protection)", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", "wrong-state-value");

      await expect(parsePromise).rejects.toThrow("OAuth state mismatch");
      expect(mockHttpServerClose).toHaveBeenCalled();
    });

    it("propagates error with description from OAuth callback", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallbackError("access_denied", "User denied access");

      await expect(parsePromise).rejects.toThrow("OAuth authorization failed: User denied access");
      expect(mockHttpServerClose).toHaveBeenCalled();
    });

    it("uses error code as description when error_description is absent", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallbackError("server_error");

      await expect(parsePromise).rejects.toThrow("OAuth authorization failed: server_error");
    });

    it("returns 400 when callback is missing code or state", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const mockRes = simulateCallbackMissingParams();

      await expect(parsePromise).rejects.toThrow("OAuth callback missing code or state parameter");
      expect(mockRes.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "text/html" });
    });

    it("closes server after successful login", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      expect(mockHttpServerClose).toHaveBeenCalled();
    });

    it("closes server when login fails", async () => {
      exchangeCodeMock.mockRejectedValue(new Error("token exchange failed"));

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);

      await expect(parsePromise).rejects.toThrow("token exchange failed");
      expect(mockHttpServerClose).toHaveBeenCalled();
    });

    it("uses custom port when specified", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login", "--port", "19000"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      expect(mockHttpServerListen).toHaveBeenCalledWith(19000, "127.0.0.1", expect.any(Function));
      expect(exchangeCodeMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        "auth-code",
        "http://localhost:19000/callback",
        expect.any(String),
      );
    });

    it("uses sandbox endpoints when configured", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: { clientId: "test-client-id", clientSecret: "test-client-secret" },
          sandbox: true,
        },
        endpoint: "https://thirdparty-sandbox.staging.qonto.co",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      expect(exchangeCodeMock).toHaveBeenCalledWith(
        OAUTH_TOKEN_SANDBOX_URL,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });

    it("omits refreshToken from saved tokens when not returned", async () => {
      exchangeCodeMock.mockResolvedValue({
        accessToken: "new-access-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      expect(saveOAuthTokensMock).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: "new-access-token" }),
        undefined,
      );
      const savedTokens = saveOAuthTokensMock.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(savedTokens).toBeDefined();
      expect(savedTokens).not.toHaveProperty("refreshToken");
    });

    it("passes profile option when specified", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.option("-p, --profile <name>", "");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login", "--profile", "work"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      expect(saveOAuthTokensMock).toHaveBeenCalledWith(expect.any(Object), { profile: "work" });
    });

    it("throws when no OAuth config", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {},
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      await expect(program.parseAsync(["auth", "login"], { from: "user" })).rejects.toThrow(
        "No OAuth credentials found",
      );
    });

    it("outputs login progress messages", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Opening browser for authorization");
      expect(output).toContain("Waiting for callback");
      expect(output).toContain("Exchanging authorization code for tokens");
      expect(output).toContain("Login successful! Tokens saved.");
    });
  });
});
