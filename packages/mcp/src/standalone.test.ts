// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "@qontoctl/core";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectServerOptionsInMemory } from "./testing/mcp-helpers.js";
import { buildStandaloneServerOptions } from "./standalone.js";

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

describe("buildStandaloneServerOptions — diagnose/getClient config-resolution lockstep (#661)", () => {
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
      // Before the fix, index.ts built `runStdioServer({ getClient })` with no
      // resolveOptions, so registerDiagnoseTools(server, undefined) ran and
      // diagnose re-derived its selection per call. The standalone entry must
      // now hand the frozen `{ path }` to the server.
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: "/startup/acme.yaml" });
      expect(opts.resolveOptions).toEqual({ path: "/startup/acme.yaml" });
    });

    it("omits resolveOptions when QONTOCTL_CONFIG_FILE is unset at startup (lockstep-by-live-read, by design)", () => {
      // Deliberate AC#3 decision: with nothing to freeze, both getClient
      // (resolveConfig(undefined)) and diagnose (?? buildMcpResolveOptions())
      // live-read process.env together and stay in lockstep. A sentinel that
      // froze diagnose to the home default here would BREAK that lockstep.
      const opts = buildStandaloneServerOptions({});
      expect(opts.resolveOptions).toBeUndefined();
    });
  });

  describe("freeze parity after a post-startup QONTOCTL_CONFIG_FILE mutation (AC#2)", () => {
    it("keeps diagnose and the data-tool getClient pinned to the startup config after the env mutates", async () => {
      const startupConfig = join(tempDir, "startup.yaml");
      writeApiKeyConfig(startupConfig, "startup-org");
      const mutatedConfig = join(tempDir, "does-not-exist.yaml"); // never created

      // Startup: env points at the real startup config; capture options once.
      process.env["QONTOCTL_CONFIG_FILE"] = startupConfig;
      const opts = buildStandaloneServerOptions();

      // Post-startup mutation: env now points at a different (nonexistent) path.
      process.env["QONTOCTL_CONFIG_FILE"] = mutatedConfig;

      // Data-tool side: getClient is frozen to the startup config. If it had
      // re-read the mutated env (the nonexistent path), resolveConfig would
      // throw; resolving successfully proves it used the startup config.
      await expect(opts.getClient()).resolves.toBeInstanceOf(HttpClient);

      // Diagnose side: drive the server from the SAME `opts` the entry produced
      // — one buildStandaloneServerOptions() call feeds both the data-tool
      // getClient (asserted above) and the diagnose resolveOptions — so this
      // exercises the real standalone wiring end-to-end. diagnose must report
      // the startup path, not the mutated env path. Before the fix (the entry
      // never threaded resolveOptions) diagnose would have re-read the mutated
      // env here and resolved the nonexistent path. fetch is stubbed in
      // beforeEach; configPath comes from resolveConfig, not the org-slug body.
      const { mcpClient } = await connectServerOptionsInMemory(opts);
      const result = await mcpClient.callTool({ name: "diagnose", arguments: {} });
      expect(result.isError).not.toBe(true);
      const report = JSON.parse(firstText(result)) as { configPath?: string };
      expect(report.configPath).toBe(startupConfig);
    });
  });

  describe("getClient auth-chain construction", () => {
    it("builds an HttpClient from an api-key config", async () => {
      const path = join(tempDir, "apikey.yaml");
      writeApiKeyConfig(path);
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: path });
      const client = await opts.getClient();
      expect(client).toBeInstanceOf(HttpClient);
      expect(client.isSandbox).toBe(false);
    });

    it("builds an HttpClient from an oauth config", async () => {
      const path = join(tempDir, "oauth.yaml");
      writeOAuthConfig(path);
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: path });
      await expect(opts.getClient()).resolves.toBeInstanceOf(HttpClient);
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
      await expect(opts.getClient()).resolves.toBeInstanceOf(HttpClient);
    });

    it("routes to the sandbox when a staging token is configured", async () => {
      const path = join(tempDir, "staging.yaml");
      writeOAuthConfig(path, { stagingToken: "test-staging-token" });
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: path });
      const client = await opts.getClient();
      expect(client.isSandbox).toBe(true);
    });

    it("rejects when the resolved config has no credentials", async () => {
      const path = join(tempDir, "empty.yaml");
      writeFileSync(path, ["auth:", "  preference: api-key", ""].join("\n"), { mode: 0o600 });
      const opts = buildStandaloneServerOptions({ QONTOCTL_CONFIG_FILE: path });
      await expect(opts.getClient()).rejects.toThrow(/No credentials/);
    });
  });
});
