// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

const mockQuestion = vi.fn();
const mockClose = vi.fn();
vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: mockClose,
  })),
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
    clearOAuthTokens: vi.fn(),
  };
});

const {
  resolveConfig,
  refreshAccessToken,
  revokeToken,
  saveOAuthTokens,
  saveOAuthClientCredentials,
  clearOAuthTokens,
} = await import("@qontoctl/core");
const resolveConfigMock = vi.mocked(resolveConfig);
const refreshAccessTokenMock = vi.mocked(refreshAccessToken);
const revokeTokenMock = vi.mocked(revokeToken);
const saveOAuthTokensMock = vi.mocked(saveOAuthTokens);
const saveOAuthClientCredentialsMock = vi.mocked(saveOAuthClientCredentials);
const clearOAuthTokensMock = vi.mocked(clearOAuthTokens);

import { registerAuthCommands } from "./auth.js";

describe("registerAuthCommands", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuestion.mockReset();
    mockClose.mockReset();
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
    it("saves client credentials successfully", async () => {
      mockQuestion.mockResolvedValueOnce("my-client-id").mockResolvedValueOnce("my-client-secret");
      saveOAuthClientCredentialsMock.mockResolvedValue(undefined);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      expect(saveOAuthClientCredentialsMock).toHaveBeenCalledWith(
        { clientId: "my-client-id", clientSecret: "my-client-secret" },
        undefined,
      );
      expect(mockClose).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("OAuth client credentials saved");
    });

    it("trims whitespace from inputs", async () => {
      mockQuestion.mockResolvedValueOnce("  spaced-id  ").mockResolvedValueOnce("  spaced-secret  ");
      saveOAuthClientCredentialsMock.mockResolvedValue(undefined);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup"], { from: "user" });

      expect(saveOAuthClientCredentialsMock).toHaveBeenCalledWith(
        { clientId: "spaced-id", clientSecret: "spaced-secret" },
        undefined,
      );
    });

    it("throws when client ID is empty", async () => {
      mockQuestion.mockResolvedValueOnce("").mockResolvedValueOnce("secret");

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      await expect(program.parseAsync(["auth", "setup"], { from: "user" })).rejects.toThrow(
        "Client ID cannot be empty",
      );
      expect(mockClose).toHaveBeenCalled();
    });

    it("throws when client secret is empty", async () => {
      mockQuestion.mockResolvedValueOnce("my-id").mockResolvedValueOnce("");

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.exitOverride();
      registerAuthCommands(program);

      await expect(program.parseAsync(["auth", "setup"], { from: "user" })).rejects.toThrow(
        "Client secret cannot be empty",
      );
      expect(mockClose).toHaveBeenCalled();
    });

    it("passes profile option when specified", async () => {
      mockQuestion.mockResolvedValueOnce("my-id").mockResolvedValueOnce("my-secret");
      saveOAuthClientCredentialsMock.mockResolvedValue(undefined);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.option("-p, --profile <name>", "");
      registerAuthCommands(program);

      await program.parseAsync(["auth", "setup", "--profile", "work"], { from: "user" });

      expect(saveOAuthClientCredentialsMock).toHaveBeenCalledWith(
        { clientId: "my-id", clientSecret: "my-secret" },
        { profile: "work" },
      );
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
            tokenExpiresAt: future,
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
            tokenExpiresAt: past,
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
            tokenExpiresAt: future,
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
});
