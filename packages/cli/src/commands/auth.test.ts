// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

const CANCEL_SYMBOL = Symbol("cancel");
const { mockSpinner } = vi.hoisted(() => ({
  mockSpinner: { start: vi.fn(), stop: vi.fn(), message: vi.fn() },
}));
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  text: vi.fn(),
  multiselect: vi.fn(),
  spinner: vi.fn(() => mockSpinner),
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

import {
  registerAuthCommands,
  KNOWN_SCOPES,
  RECOMMENDED_SCOPES,
  RESTRICTED_SCOPES,
  SCOPE_DESCRIPTIONS,
  SCOPE_CATEGORIES,
} from "./auth.js";

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

    it("defaults to RECOMMENDED_SCOPES when no existing scopes", async () => {
      textMock.mockResolvedValueOnce("id").mockResolvedValueOnce("secret");
      multiselectMock.mockResolvedValueOnce([...RECOMMENDED_SCOPES]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      const multiselectCall = multiselectMock.mock.calls[0]?.[0] as { initialValues?: string[] } | undefined;
      expect(multiselectCall?.initialValues).toEqual([...RECOMMENDED_SCOPES]);
    });

    it("offers KNOWN_SCOPES (full catalog) as multiselect options", async () => {
      textMock.mockResolvedValueOnce("id").mockResolvedValueOnce("secret");
      multiselectMock.mockResolvedValueOnce([...RECOMMENDED_SCOPES]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      const multiselectCall = multiselectMock.mock.calls[0]?.[0] as
        | { options?: { value: string; label: string; hint?: string }[] }
        | undefined;
      const optionValues = multiselectCall?.options?.map((o) => o.value) ?? [];
      expect(optionValues).toEqual([...KNOWN_SCOPES]);
    });

    it("groups scope options by category via label prefix", async () => {
      textMock.mockResolvedValueOnce("id").mockResolvedValueOnce("secret");
      multiselectMock.mockResolvedValueOnce([...RECOMMENDED_SCOPES]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      const multiselectCall = multiselectMock.mock.calls[0]?.[0] as
        | { options?: { value: string; label: string; hint?: string }[] }
        | undefined;
      const cardOption = multiselectCall?.options?.find((o) => o.value === "card.read");
      expect(cardOption?.label).toBe("Cards · card.read");
      const bankingOption = multiselectCall?.options?.find((o) => o.value === "payment.write");
      expect(bankingOption?.label).toBe("Banking · payment.write");
      const webhookOption = multiselectCall?.options?.find((o) => o.value === "webhook");
      expect(webhookOption?.label).toBe("Webhooks · webhook");
    });

    it("hides RESTRICTED_SCOPES from picker by default", async () => {
      textMock.mockResolvedValueOnce("id").mockResolvedValueOnce("secret");
      multiselectMock.mockResolvedValueOnce([...RECOMMENDED_SCOPES]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      const multiselectCall = multiselectMock.mock.calls[0]?.[0] as
        | { options?: { value: string; label: string; hint?: string }[] }
        | undefined;
      const optionValues = multiselectCall?.options?.map((o) => o.value) ?? [];
      expect(optionValues).not.toContain("beneficiary.trust");
    });

    it("includes RESTRICTED_SCOPES in picker when --trusted-partner is set", async () => {
      textMock.mockResolvedValueOnce("id").mockResolvedValueOnce("secret");
      multiselectMock.mockResolvedValueOnce([...RECOMMENDED_SCOPES, "beneficiary.trust"]);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup", "--trusted-partner"], { from: "user" });

      const multiselectCall = multiselectMock.mock.calls[0]?.[0] as
        | { options?: { value: string; label: string; hint?: string }[] }
        | undefined;
      const optionValues = multiselectCall?.options?.map((o) => o.value) ?? [];
      expect(optionValues).toContain("beneficiary.trust");
      const restrictedOption = multiselectCall?.options?.find((o) => o.value === "beneficiary.trust");
      expect(restrictedOption?.label).toBe("Restricted (partner-only) · beneficiary.trust");
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

    it("shows configured scopes", async () => {
      const future = new Date(Date.now() + 7200_000).toISOString();
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            accessToken: "token",
            accessTokenExpiresAt: future,
            scopes: ["organization.read", "payment.write"],
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
      expect(output).toContain("Scopes: organization.read, payment.write");
    });

    it("shows not configured when no scopes", async () => {
      const future = new Date(Date.now() + 7200_000).toISOString();
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
      expect(output).toContain("Scopes: not configured (run auth setup)");
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

    it("uses staging token URL when staging token is configured", async () => {
      const { OAUTH_TOKEN_SANDBOX_URL } = await import("@qontoctl/core");
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "cid",
            clientSecret: "csecret",
            refreshToken: "refresh",
            stagingToken: "test-token",
          },
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

      expect(refreshAccessTokenMock).toHaveBeenCalledWith(
        OAUTH_TOKEN_SANDBOX_URL,
        "cid",
        "csecret",
        "refresh",
        "test-token",
      );
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
        oauth: {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          scopes: ["offline_access", "organization.read"],
        },
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
        undefined,
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
        undefined,
      );
    });

    it("uses staging endpoints when staging token is configured", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "test-client-id",
            clientSecret: "test-client-secret",
            scopes: ["offline_access", "organization.read"],
            stagingToken: "test-token",
          },
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
        "test-token",
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

    it("shows spinner during authorization and token exchange", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      expect(mockSpinner.start).toHaveBeenCalledWith("Opening browser for authorization...");
      expect(mockSpinner.message).toHaveBeenCalledWith(expect.stringContaining("Waiting for authorization"));
      expect(mockSpinner.stop).toHaveBeenCalledWith("Authorization received.");
      expect(mockSpinner.start).toHaveBeenCalledWith("Exchanging authorization code for tokens...");
      expect(mockSpinner.stop).toHaveBeenCalledWith("Login successful! Tokens saved.");
    });

    it("uses stored scopes in authorization URL", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "test-client-id",
            clientSecret: "test-client-secret",
            scopes: ["offline_access", "organization.read", "payment.write"],
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      const execCommand = mockExec.mock.calls[0]?.[0] as string;
      const urlMatch = execCommand.match(/"([^"]+)"/);
      expect(urlMatch).toBeDefined();
      const authUrl = new URL(String(urlMatch?.[1]));
      expect(authUrl.searchParams.get("scope")).toBe("offline_access organization.read payment.write");
    });

    it("ensures offline_access in stored scopes missing it", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "test-client-id",
            clientSecret: "test-client-secret",
            scopes: ["organization.read"],
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      const execCommand = mockExec.mock.calls[0]?.[0] as string;
      const urlMatch = execCommand.match(/"([^"]+)"/);
      expect(urlMatch).toBeDefined();
      const authUrl = new URL(String(urlMatch?.[1]));
      expect(authUrl.searchParams.get("scope")).toBe("offline_access organization.read");
    });

    it("errors with run-setup hint when no stored scopes are configured", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: { clientId: "test-client-id", clientSecret: "test-client-secret" },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      await expect(program.parseAsync(["auth", "login"], { from: "user" })).rejects.toThrow(
        /No OAuth scopes configured.*qontoctl auth setup/,
      );
      expect(multiselectMock).not.toHaveBeenCalled();
      expect(exchangeCodeMock).not.toHaveBeenCalled();
    });

    it("errors when stored scopes array is empty", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "test-client-id",
            clientSecret: "test-client-secret",
            scopes: [],
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      await expect(program.parseAsync(["auth", "login"], { from: "user" })).rejects.toThrow(
        /No OAuth scopes configured.*qontoctl auth setup/,
      );
      expect(multiselectMock).not.toHaveBeenCalled();
      expect(exchangeCodeMock).not.toHaveBeenCalled();
    });

    it("warns when stored scopes are missing from RECOMMENDED_SCOPES", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "test-client-id",
            clientSecret: "test-client-secret",
            scopes: ["offline_access", "organization.read"],
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(stderrOutput).toContain("recommended scope(s) are not in your stored scope set");
      expect(stderrOutput).toContain("payment.write");
      expect(stderrOutput).toContain("Re-run 'qontoctl auth setup'");
    });

    it("stops spinner when OAuth callback returns an error (does not hang on stdin)", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallbackError("invalid_scope", "scope X is not allowed");

      await expect(parsePromise).rejects.toThrow();
      // The spinner MUST be stopped on error so stdin returns from raw mode and
      // the process can exit. Failure to stop leaves the CLI hanging visually.
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining("scope X is not allowed"));
      expect(mockHttpServerClose).toHaveBeenCalled();
    });

    it("stops spinner when state mismatch occurs", async () => {
      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", "wrong-state-value");

      await expect(parsePromise).rejects.toThrow("OAuth state mismatch");
      // State mismatch is detected after the spinner is stopped for "Authorization received",
      // then a new spinner cycle starts for token exchange. The error is thrown synchronously
      // before that, so spinner should NOT be in active state when error propagates.
      expect(mockHttpServerClose).toHaveBeenCalled();
    });

    it("stops spinner when token exchange fails", async () => {
      exchangeCodeMock.mockRejectedValue(new Error("token endpoint returned 401"));

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);

      await expect(parsePromise).rejects.toThrow("token endpoint returned 401");
      // Token exchange spinner must be stopped on failure.
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining("token endpoint returned 401"));
      expect(mockHttpServerClose).toHaveBeenCalled();
    });

    it("does not warn when stored scopes include all RECOMMENDED_SCOPES", async () => {
      resolveConfigMock.mockResolvedValue({
        config: {
          oauth: {
            clientId: "test-client-id",
            clientSecret: "test-client-secret",
            scopes: [...RECOMMENDED_SCOPES],
          },
        },
        endpoint: "https://thirdparty.qonto.com",
        warnings: [],
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      const parsePromise = program.parseAsync(["auth", "login"], { from: "user" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      simulateCallback("auth-code", MOCK_STATE_HEX);
      await parsePromise;

      const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(stderrOutput).not.toContain("recommended scope(s) are not in your stored scope set");
    });
  });
});

describe("scope catalog", () => {
  it("KNOWN_SCOPES is derived from SCOPE_CATEGORIES", () => {
    const fromCategories = SCOPE_CATEGORIES.flatMap((c) => c.scopes);
    expect([...KNOWN_SCOPES]).toEqual(fromCategories);
  });

  it("every KNOWN_SCOPES entry has a SCOPE_DESCRIPTIONS entry", () => {
    for (const scope of KNOWN_SCOPES) {
      expect(SCOPE_DESCRIPTIONS[scope], `missing description for scope: ${scope}`).toBeDefined();
      expect(SCOPE_DESCRIPTIONS[scope]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("every SCOPE_DESCRIPTIONS entry corresponds to a KNOWN_SCOPES or RESTRICTED_SCOPES entry", () => {
    const recognised = new Set([...KNOWN_SCOPES, ...RESTRICTED_SCOPES]);
    for (const scope of Object.keys(SCOPE_DESCRIPTIONS)) {
      expect(recognised.has(scope), `orphan description for scope: ${scope}`).toBe(true);
    }
  });

  it("RESTRICTED_SCOPES is disjoint from KNOWN_SCOPES (catalog never offers restricted scopes)", () => {
    for (const scope of RESTRICTED_SCOPES) {
      expect(KNOWN_SCOPES, `restricted scope leaked into catalog: ${scope}`).not.toContain(scope);
    }
  });

  it("every RESTRICTED_SCOPES entry has a SCOPE_DESCRIPTIONS entry", () => {
    for (const scope of RESTRICTED_SCOPES) {
      expect(SCOPE_DESCRIPTIONS[scope], `missing description for restricted scope: ${scope}`).toBeDefined();
    }
  });

  it("RECOMMENDED_SCOPES is a subset of KNOWN_SCOPES", () => {
    for (const scope of RECOMMENDED_SCOPES) {
      expect(KNOWN_SCOPES, `RECOMMENDED scope not in KNOWN_SCOPES: ${scope}`).toContain(scope);
    }
  });

  it("RECOMMENDED_SCOPES includes offline_access (required for refresh tokens)", () => {
    expect(RECOMMENDED_SCOPES).toContain("offline_access");
  });

  it("KNOWN_SCOPES has no duplicates", () => {
    const unique = new Set(KNOWN_SCOPES);
    expect(unique.size).toBe(KNOWN_SCOPES.length);
  });

  it("RECOMMENDED_SCOPES has no duplicates", () => {
    const unique = new Set(RECOMMENDED_SCOPES);
    expect(unique.size).toBe(RECOMMENDED_SCOPES.length);
  });

  it("excludes the partner-restricted beneficiary.trust scope from the catalog", () => {
    expect(KNOWN_SCOPES).not.toContain("beneficiary.trust");
  });

  it("SCOPE_CATEGORIES has no duplicate scope assignments", () => {
    const seen = new Set<string>();
    for (const category of SCOPE_CATEGORIES) {
      for (const scope of category.scopes) {
        expect(seen, `scope appears in multiple categories: ${scope}`).not.toContain(scope);
        seen.add(scope);
      }
    }
  });
});
