// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient, resolveConfig } from "@qontoctl/core";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectServerOptionsInMemory } from "./testing/mcp-helpers.js";
import { buildStandaloneServerOptions } from "./standalone.js";
import type { CreateServerOptions } from "./server.js";

interface TextContent {
  readonly type: string;
  readonly text: string;
}

function firstText(result: { content: unknown }): string {
  const content = result.content as TextContent[];
  expect(content.length).toBeGreaterThan(0);
  return (content[0] as TextContent).text;
}

// All config fixtures are written 0o600 — matching production (profile/add.ts,
// config/writer.ts) and keeping resolveConfig's "group/world readable" stderr
// warning (fired for OAuth-bearing files) out of the test output.
function writeApiKeyConfig(path: string, slug = "test-org"): void {
  writeFileSync(
    path,
    [
      "api-key:",
      `  organization-slug: ${slug}`,
      "  secret-key: test-secret-key",
      "auth:",
      "  preference: api-key",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
}

function writeOAuthConfig(path: string, opts?: { stagingToken?: string }): void {
  const lines = [
    "oauth:",
    "  client-id: test-client-id",
    "  client-secret: test-client-secret",
    "  access-token: test-access-token",
    ...(opts?.stagingToken !== undefined ? [`  staging-token: ${opts.stagingToken}`] : []),
    "auth:",
    "  preference: oauth",
    "",
  ];
  writeFileSync(path, lines.join("\n"), { mode: 0o600 });
}

/**
 * Wrap a server options' `buildClient` so the test can observe the path of the
 * ConfigResult the server's single resolver hands the data-tool side — the
 * structural assertion behind #663 (data tools and diagnose resolve the same
 * file). The real `buildClient` still runs, so the data tool gets a working
 * client.
 */
function captureDataToolPath(opts: CreateServerOptions, sink: { path?: string }): CreateServerOptions {
  return {
    ...opts,
    buildClient: (result) => {
      sink.path = result.path;
      return opts.buildClient(result);
    },
  };
}

describe("buildStandaloneServerOptions — diagnose/data-tool config-resolution lockstep (#661, #663)", () => {
  let tempDir: string;
  let originalConfigEnv: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "qontoctl-standalone-mcp-"));
    originalConfigEnv = process.env["QONTOCTL_CONFIG_FILE"];
    const fetchSpy = vi.fn();
    fetchSpy.mockReturnValue(
      jsonResponse({ organization: { slug: "test-org", legal_name: "Test Co", bank_accounts: [] } }),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    if (originalConfigEnv === undefined) {
      delete process.env["QONTOCTL_CONFIG_FILE"];
    } else {
      process.env["QONTOCTL_CONFIG_FILE"] = originalConfigEnv;
    }
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("resolveOptions threading", () => {
    it("threads the startup-frozen config selection into the server's resolveOptions (the #661 fix)", () => {
      // The standalone entry must hand the frozen `{ path }` to the server so
      // createServer builds its single resolver from it (#663).
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: "/startup/acme.yaml" });
      expect(opts.resolveOptions).toEqual({ path: "/startup/acme.yaml" });
    });

    it("omits resolveOptions when QONTOCTL_CONFIG_FILE is unset at startup (lockstep-by-live-read, by design)", () => {
      // With nothing to freeze, the server's resolver live-reads process.env on
      // every call, so the data tools and diagnose live-read together and stay
      // in lockstep. The standalone entry must NOT invent a frozen selection
      // here — that would break the lockstep.
      const opts = buildStandaloneServerOptions({});
      expect(opts.resolveOptions).toBeUndefined();
    });
  });

  describe("config-resolution lockstep after a post-startup QONTOCTL_CONFIG_FILE mutation (AC#2)", () => {
    it("keeps the data tools AND diagnose pinned to the startup config after the env mutates (frozen)", async () => {
      const startupConfig = join(tempDir, "startup.yaml");
      writeApiKeyConfig(startupConfig, "startup-org");
      const mutatedConfig = join(tempDir, "does-not-exist.yaml"); // never created

      // Startup: env points at the real startup config; capture options once.
      process.env["QONTOCTL_CONFIG_FILE"] = startupConfig;
      const opts = buildStandaloneServerOptions();

      // Post-startup mutation: env now points at a different (nonexistent) path.
      process.env["QONTOCTL_CONFIG_FILE"] = mutatedConfig;

      const sink: { path?: string } = {};
      const { mcpClient } = await connectServerOptionsInMemory(captureDataToolPath(opts, sink));

      // Data-tool side: getClient → server.resolve → buildClient. If the
      // resolver had re-read the mutated env (nonexistent), resolveConfig would
      // throw and the tool would error; a clean result proves it used the
      // frozen startup config.
      const dataResult = await mcpClient.callTool({ name: "org_show", arguments: {} });
      expect(dataResult.isError).not.toBe(true);
      expect(sink.path).toBe(startupConfig);

      // Diagnose side: same server, same resolver. Before #663 this lockstep had
      // to be re-established by threading resolveOptions into diagnose; now the
      // server owns the one resolver, so both sides resolve the startup config.
      const diagResult = await mcpClient.callTool({ name: "diagnose", arguments: {} });
      expect(diagResult.isError).not.toBe(true);
      const report = JSON.parse(firstText(diagResult)) as { configPath?: string };
      expect(report.configPath).toBe(startupConfig);

      // AC#1 — both sides resolved the SAME file (divergence structurally impossible).
      expect(report.configPath).toBe(sink.path);
    });

    it("live-reads the mutated env for BOTH sides when unset at startup (live-read lockstep)", async () => {
      const laterConfig = join(tempDir, "later.yaml");
      writeApiKeyConfig(laterConfig, "later-org");

      // Unset at startup → resolveOptions omitted → the server's resolver
      // live-reads process.env on every call.
      delete process.env["QONTOCTL_CONFIG_FILE"];
      const opts = buildStandaloneServerOptions();
      expect(opts.resolveOptions).toBeUndefined();

      // Set the env AFTER startup — both sides must pick it up together.
      process.env["QONTOCTL_CONFIG_FILE"] = laterConfig;

      const sink: { path?: string } = {};
      const { mcpClient } = await connectServerOptionsInMemory(captureDataToolPath(opts, sink));

      const dataResult = await mcpClient.callTool({ name: "org_show", arguments: {} });
      expect(dataResult.isError).not.toBe(true);
      expect(sink.path).toBe(laterConfig);

      const diagResult = await mcpClient.callTool({ name: "diagnose", arguments: {} });
      expect(diagResult.isError).not.toBe(true);
      const report = JSON.parse(firstText(diagResult)) as { configPath?: string };
      expect(report.configPath).toBe(laterConfig);
      expect(report.configPath).toBe(sink.path);
    });
  });

  describe("buildClient auth-chain construction", () => {
    it("builds an HttpClient from an api-key config", async () => {
      const path = join(tempDir, "apikey.yaml");
      writeApiKeyConfig(path);
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: path });
      const client = opts.buildClient(await resolveConfig({ path }));
      expect(client).toBeInstanceOf(HttpClient);
      expect(client.isSandbox).toBe(false);
    });

    it("builds an HttpClient from an oauth config", async () => {
      const path = join(tempDir, "oauth.yaml");
      writeOAuthConfig(path);
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: path });
      expect(opts.buildClient(await resolveConfig({ path }))).toBeInstanceOf(HttpClient);
    });

    it("builds a primary+fallback HttpClient when both credential types are present", async () => {
      const path = join(tempDir, "both.yaml");
      writeFileSync(
        path,
        [
          "api-key:",
          "  organization-slug: test-org",
          "  secret-key: test-secret-key",
          "oauth:",
          "  client-id: test-client-id",
          "  client-secret: test-client-secret",
          "  access-token: test-access-token",
          "",
        ].join("\n"),
        { mode: 0o600 },
      );
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: path });
      expect(opts.buildClient(await resolveConfig({ path }))).toBeInstanceOf(HttpClient);
    });

    it("routes to the sandbox when a staging token is configured", async () => {
      const path = join(tempDir, "staging.yaml");
      writeOAuthConfig(path, { stagingToken: "test-staging-token" });
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: path });
      const client = opts.buildClient(await resolveConfig({ path }));
      expect(client.isSandbox).toBe(true);
    });

    it("a data tool errors when the resolved config has no credentials", async () => {
      // resolveConfig is the gate — it throws NO_CREDS before buildClient runs,
      // so the server's getClient rejects and the tool reports an error.
      const path = join(tempDir, "empty.yaml");
      writeFileSync(path, ["auth:", "  preference: api-key", ""].join("\n"), { mode: 0o600 });
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: path });
      const { mcpClient } = await connectServerOptionsInMemory(opts);
      const result = await mcpClient.callTool({ name: "org_show", arguments: {} });
      expect(result.isError).toBe(true);
    });
  });
});
