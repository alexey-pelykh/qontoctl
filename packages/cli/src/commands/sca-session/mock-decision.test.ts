// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    resolveConfig: vi.fn(),
    mockScaDecision: vi.fn(),
  };
});

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { resolveConfig, mockScaDecision } = await import("@qontoctl/core");
const resolveConfigMock = vi.mocked(resolveConfig);
const mockScaDecisionMock = vi.mocked(mockScaDecision);

const { registerScaSessionCommands } = await import("./index.js");

function buildSandboxConfig() {
  return {
    config: {
      apiKey: { organizationSlug: "test-org", secretKey: "test-secret" },
      oauth: {
        clientId: "client-id",
        clientSecret: "client-secret",
        stagingToken: "stg-token",
      },
    },
    endpoint: "https://thirdparty-sandbox.staging.qonto.co",
    warnings: [],
  };
}

function buildProductionConfig() {
  return {
    config: {
      apiKey: { organizationSlug: "test-org", secretKey: "test-secret" },
    },
    endpoint: "https://thirdparty.qonto.com",
    warnings: [],
  };
}

describe("sca-session mock-decision command", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    // createClient is treated as a return-anything stub; the SDK call is mocked separately.
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies allow decision in sandbox", async () => {
    resolveConfigMock.mockResolvedValue(buildSandboxConfig());
    mockScaDecisionMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerScaSessionCommands(program);

    await program.parseAsync(["sca-session", "mock-decision", "tok-1", "allow"], { from: "user" });

    expect(mockScaDecisionMock).toHaveBeenCalledWith(expect.anything(), "tok-1", "allow");
    expect(stdoutSpy).toHaveBeenCalled();
    const output = (stdoutSpy.mock.calls[0]?.[0] as string) ?? "";
    expect(output).toContain('SCA mock decision "allow" applied to session tok-1.');
  });

  it("applies deny decision in sandbox", async () => {
    resolveConfigMock.mockResolvedValue(buildSandboxConfig());
    mockScaDecisionMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerScaSessionCommands(program);

    await program.parseAsync(["sca-session", "mock-decision", "tok-2", "deny"], { from: "user" });

    expect(mockScaDecisionMock).toHaveBeenCalledWith(expect.anything(), "tok-2", "deny");
    const output = (stdoutSpy.mock.calls[0]?.[0] as string) ?? "";
    expect(output).toContain('"deny"');
  });

  it("outputs json format when requested", async () => {
    resolveConfigMock.mockResolvedValue(buildSandboxConfig());
    mockScaDecisionMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerScaSessionCommands(program);

    await program.parseAsync(["sca-session", "mock-decision", "tok-3", "allow"], { from: "user" });

    const output = (stdoutSpy.mock.calls[0]?.[0] as string) ?? "";
    const parsed = JSON.parse(output) as { token: string; decision: string; applied: boolean };
    expect(parsed).toEqual({ token: "tok-3", decision: "allow", applied: true });
  });

  it("errors clearly when not in sandbox (no staging token)", async () => {
    resolveConfigMock.mockResolvedValue(buildProductionConfig());

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerScaSessionCommands(program);

    await expect(
      program.parseAsync(["sca-session", "mock-decision", "tok-4", "allow"], { from: "user" }),
    ).rejects.toThrow(/sandbox/i);

    expect(mockScaDecisionMock).not.toHaveBeenCalled();
  });

  it("errors clearly when oauth section has no staging token", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: { clientId: "id", clientSecret: "secret", accessToken: "tok" },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerScaSessionCommands(program);

    await expect(
      program.parseAsync(["sca-session", "mock-decision", "tok-5", "allow"], { from: "user" }),
    ).rejects.toThrow(/staging-token|QONTOCTL_STAGING_TOKEN/);

    expect(mockScaDecisionMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid decision argument", async () => {
    resolveConfigMock.mockResolvedValue(buildSandboxConfig());

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerScaSessionCommands(program);

    await expect(
      program.parseAsync(["sca-session", "mock-decision", "tok-6", "maybe"], { from: "user" }),
    ).rejects.toThrow(/Invalid decision/);

    expect(mockScaDecisionMock).not.toHaveBeenCalled();
  });

  it("propagates network/API errors from mockScaDecision", async () => {
    resolveConfigMock.mockResolvedValue(buildSandboxConfig());
    const apiError = new Error("API request failed: 500 Internal Server Error");
    mockScaDecisionMock.mockRejectedValue(apiError);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerScaSessionCommands(program);

    await expect(
      program.parseAsync(["sca-session", "mock-decision", "tok-7", "allow"], { from: "user" }),
    ).rejects.toThrow("API request failed");
  });
});
