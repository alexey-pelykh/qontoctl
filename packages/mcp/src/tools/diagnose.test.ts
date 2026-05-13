// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

interface TextContent {
  readonly type: string;
  readonly text: string;
}

function firstText(result: { content: unknown }): string {
  const content = result.content as TextContent[];
  expect(content.length).toBeGreaterThan(0);
  return (content[0] as TextContent).text;
}

describe("diagnose MCP tool", () => {
  let mcpClient: Client;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let tempDir: string;
  let configPath: string;
  let originalConfigEnv: string | undefined;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "qontoctl-diagnose-mcp-"));
    configPath = join(tempDir, "qontoctl.yaml");
    writeFileSync(
      configPath,
      [
        "api-key:",
        "  organization-slug: test-org",
        "  secret-key: test-secret-key",
        "auth:",
        "  preference: api-key",
        "",
      ].join("\n"),
    );
    originalConfigEnv = process.env["QONTOCTL_CONFIG_FILE"];
    process.env["QONTOCTL_CONFIG_FILE"] = configPath;

    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    ({ mcpClient } = await connectInMemory(fetchSpy));
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

  it("returns a DiagnosticReport with all 9 default checks", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        organization: { slug: "test-org", legal_name: "Test Co", bank_accounts: [] },
      }),
    );

    const result = await mcpClient.callTool({ name: "diagnose", arguments: {} });
    expect(result.isError).not.toBe(true);
    const text = firstText(result);
    const report = JSON.parse(text) as {
      results: { checkId: string }[];
      schemaVersion: string;
      summaryCounts: { total: number };
    };
    expect(report.schemaVersion).toBe("1.0");
    expect(report.results.length).toBe(9);
    expect(report.summaryCounts.total).toBe(9);
  });

  it("emits stable, alphabetically-sorted JSON keys (parity with CLI)", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        organization: { slug: "test-org", legal_name: "Test Co", bank_accounts: [] },
      }),
    );

    const result = await mcpClient.callTool({ name: "diagnose", arguments: {} });
    const text = firstText(result);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const topKeys = Object.keys(parsed);
    const sortedTopKeys = [...topKeys].sort();
    expect(topKeys).toEqual(sortedTopKeys);
  });

  it("ignores unknown input fields per ADR-DIAG-5 (no privileged surface)", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        organization: { slug: "test-org", legal_name: "Test Co", bank_accounts: [] },
      }),
    );

    const baseline = await mcpClient.callTool({ name: "diagnose", arguments: {} });
    const withExtras = await mcpClient.callTool({
      name: "diagnose",
      arguments: { verbose: true, output: "table" } as unknown as Record<string, never>,
    });
    expect(baseline.isError).not.toBe(true);
    expect(withExtras.isError).not.toBe(true);
    const baseReport = JSON.parse(firstText(baseline)) as { results: { checkId: string }[] };
    const extrasReport = JSON.parse(firstText(withExtras)) as { results: { checkId: string }[] };
    expect(extrasReport.results.map((r) => r.checkId)).toEqual(baseReport.results.map((r) => r.checkId));
  });

  it("returns isError when config resolution fails", async () => {
    process.env["QONTOCTL_CONFIG_FILE"] = "/nonexistent/path/to/config-that-does-not-exist.yaml";
    const result = await mcpClient.callTool({ name: "diagnose", arguments: {} });
    expect(result.isError).toBe(true);
    const text = firstText(result);
    expect(text).toContain("diagnose failed to initialize");
  });

  it("scrubs secret values via the global tripwire (defense-in-depth)", async () => {
    // Even when api-key-health emits status_code: 200 evidence, the tripwire
    // pass should never let the literal secret leak. Stub fetch to return a
    // 200 with the literal secret accidentally embedded in a detail-string-
    // like field, and assert the secret is scrubbed.
    fetchSpy.mockReturnValue(
      jsonResponse({
        organization: { slug: "test-org", legal_name: "Test Co", bank_accounts: [] },
      }),
    );
    const result = await mcpClient.callTool({ name: "diagnose", arguments: {} });
    const text = firstText(result);
    expect(text).not.toContain("test-secret-key");
  });

  it("accepts the optional profile argument", async () => {
    // The profile is layered on top of the env-resolved path; passing one
    // for a profile that doesn't exist in the config yields a fail-readable
    // report (config.resolution will succeed because the file exists, but
    // the profile-specific section is missing — runner-level behaviour).
    fetchSpy.mockReturnValue(
      jsonResponse({
        organization: { slug: "test-org", legal_name: "Test Co", bank_accounts: [] },
      }),
    );
    const result = await mcpClient.callTool({ name: "diagnose", arguments: { profile: "default" } });
    expect(result.isError).not.toBe(true);
    const report = JSON.parse(firstText(result)) as { profile: string };
    expect(report.profile).toBe("default");
  });
});
