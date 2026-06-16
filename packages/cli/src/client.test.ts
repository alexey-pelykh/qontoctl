// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BuildClientOptions, ConfigResult, HttpClient } from "@qontoctl/core";
import { createClient, buildClientFromGlobalOptions } from "./client.js";

// #663: the auth-chain assembly moved to core's `buildClientFromConfig`. The CLI
// now only RESOLVES config and MAPS GlobalOptions → BuildClientOptions, so these
// tests mock `buildClientFromConfig` (its own behaviour is covered by core's
// build-client.test.ts) and assert the wrapper concerns: resolveConfig
// threading, the file-warning + debug-warning emits, logger construction, and
// the flag→options mapping.
vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return { ...actual, resolveConfig: vi.fn(), buildClientFromConfig: vi.fn() };
});

const { resolveConfig, buildClientFromConfig } = await import("@qontoctl/core");
const resolveConfigMock = vi.mocked(resolveConfig);
const buildClientFromConfigMock = vi.mocked(buildClientFromConfig);

const SENTINEL_CLIENT = { __brand: "stub-client" } as unknown as HttpClient;

function makeResult(overrides?: Partial<ConfigResult>): ConfigResult {
  return {
    config: { apiKey: { organizationSlug: "test-org", secretKey: "test-secret" } },
    endpoint: "https://thirdparty.qonto.com",
    warnings: [],
    oauthAccessTokenFromEnv: false,
    ...overrides,
  };
}

/** The BuildClientOptions the wrapper passed to core's buildClientFromConfig. */
function passedOptions(): BuildClientOptions | undefined {
  return buildClientFromConfigMock.mock.calls[0]?.[1];
}

describe("createClient (resolve + delegate wrapper)", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    resolveConfigMock.mockResolvedValue(makeResult());
    buildClientFromConfigMock.mockReturnValue(SENTINEL_CLIENT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves config and returns the client core builds", async () => {
    const client = await createClient({ output: "table" });
    expect(resolveConfigMock).toHaveBeenCalledTimes(1);
    expect(buildClientFromConfigMock).toHaveBeenCalledTimes(1);
    expect(client).toBe(SENTINEL_CLIENT);
  });

  it("threads the profile into resolveConfig", async () => {
    await createClient({ output: "table", profile: "work" });
    expect(resolveConfigMock).toHaveBeenCalledWith({ profile: "work" });
  });

  it("prints file-resolution warnings to stderr", async () => {
    resolveConfigMock.mockResolvedValue(makeResult({ warnings: ["Unknown key: foo"] }));
    await createClient({ output: "table" });
    expect(stderrSpy).toHaveBeenCalledWith("Warning: Unknown key: foo\n");
  });

  it("passes the resolved result through to buildClientFromConfig", async () => {
    const result = makeResult();
    resolveConfigMock.mockResolvedValue(result);
    await createClient({ output: "table" });
    expect(buildClientFromConfigMock).toHaveBeenCalledWith(result, expect.any(Object));
  });

  describe("GlobalOptions → BuildClientOptions mapping", () => {
    it("maps --auth to authPreference", async () => {
      await createClient({ output: "table", auth: "api-key" });
      expect(passedOptions()?.authPreference).toBe("api-key");
    });

    it("maps --profile to profile", async () => {
      await createClient({ output: "table", profile: "work" });
      expect(passedOptions()?.profile).toBe("work");
    });

    it("maps --sca-method to scaMethodOverride", async () => {
      await createClient({ output: "table", scaMethod: "passkey" });
      expect(passedOptions()?.scaMethodOverride).toBe("passkey");
    });

    it("omits authPreference / profile / scaMethodOverride when no flags set", async () => {
      await createClient({ output: "table" });
      const opts = passedOptions();
      expect(opts?.authPreference).toBeUndefined();
      expect(opts?.profile).toBeUndefined();
      expect(opts?.scaMethodOverride).toBeUndefined();
    });

    it("always wires an onWarning sink", async () => {
      await createClient({ output: "table" });
      expect(typeof passedOptions()?.onWarning).toBe("function");
    });
  });

  describe("logger", () => {
    it("does not build a logger by default", async () => {
      await createClient({ output: "table" });
      expect(passedOptions()?.logger).toBeUndefined();
    });

    it("builds a debug logger and emits the data-exposure warning when --debug is set", async () => {
      await createClient({ output: "table", debug: true });
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Debug mode logs full API responses"));

      const logger = passedOptions()?.logger;
      expect(logger).toBeDefined();
      logger?.verbose("verbose msg");
      expect(stderrSpy).toHaveBeenCalledWith("verbose msg\n");
      logger?.debug("debug msg");
      expect(stderrSpy).toHaveBeenCalledWith("debug msg\n");
    });

    it("builds a verbose-only logger (debug is a no-op) and emits no debug warning when --verbose is set", async () => {
      await createClient({ output: "table", verbose: true });

      const calls = stderrSpy.mock.calls.map((call: [string]) => call[0]) as string[];
      expect(calls.every((msg) => !msg.includes("Debug mode"))).toBe(true);

      const logger = passedOptions()?.logger;
      expect(logger).toBeDefined();
      logger?.verbose("verbose msg");
      expect(stderrSpy).toHaveBeenCalledWith("verbose msg\n");

      stderrSpy.mockClear();
      logger?.debug("debug msg");
      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });

  it("propagates errors thrown by buildClientFromConfig (e.g. no credentials)", async () => {
    buildClientFromConfigMock.mockImplementation(() => {
      throw new Error("No credentials found in configuration");
    });
    await expect(createClient({ output: "table" })).rejects.toThrow("No credentials found in configuration");
  });
});

describe("buildClientFromGlobalOptions (umbrella mcp buildClient bridge)", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    buildClientFromConfigMock.mockReturnValue(SENTINEL_CLIENT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits the resolved result's file warnings and delegates to buildClientFromConfig", () => {
    const result = makeResult({ warnings: ["chmod 600 your config"] });
    const client = buildClientFromGlobalOptions(result, { output: "table" });
    expect(stderrSpy).toHaveBeenCalledWith("Warning: chmod 600 your config\n");
    expect(buildClientFromConfigMock).toHaveBeenCalledWith(result, expect.any(Object));
    expect(client).toBe(SENTINEL_CLIENT);
  });

  it("maps the global flags onto BuildClientOptions", () => {
    buildClientFromGlobalOptions(makeResult(), { output: "table", auth: "oauth", profile: "p", scaMethod: "mock" });
    const opts = passedOptions();
    expect(opts?.authPreference).toBe("oauth");
    expect(opts?.profile).toBe("p");
    expect(opts?.scaMethodOverride).toBe("mock");
  });
});
