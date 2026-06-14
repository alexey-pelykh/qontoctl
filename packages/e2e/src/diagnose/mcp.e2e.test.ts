// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DiagnosticReportSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, getCredentials, hasApiKeyCredentials } from "../sandbox.js";

/**
 * Diagnose MCP E2E. Mirrors the CLI E2E happy path plus the input-schema
 * validation that MCP-only consumers cannot reach via the CLI.
 *
 * Gated on api-key credentials so it runs both in CI and locally. The
 * MCP tool builds its own clients from config — auth-preference is
 * resolved internally — so this works regardless of which credential
 * mode is configured.
 */
describe.skipIf(!hasApiKeyCredentials())("diagnose MCP (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });
    client = new Client({ name: "diagnose-e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it("returns a DiagnosticReport that validates against the canonical schema", async () => {
    const result = await client.callTool({ name: "diagnose", arguments: {} });
    expect(result.isError).not.toBe(true);
    const text = firstTextFromMcpResult(result);
    const parsed: unknown = JSON.parse(text);
    const report = DiagnosticReportSchema.parse(parsed);
    expect(report.results.length).toBe(9);
    expect(report.schemaVersion).toBe("1.0");
  });

  it("ignores unknown input fields per ADR-DIAG-5 (no privileged surface)", async () => {
    // The Zod input schema declares only `profile?`. Per the MCP SDK's
    // default schema construction (`.strip()`-style), unknown fields
    // pass through but are ignored — they never elevate the tool's
    // surface. Verify by passing extras and confirming the output is
    // structurally identical to the no-args call: same checks, same
    // count, same shape.
    const baseline = await client.callTool({ name: "diagnose", arguments: {} });
    const withExtras = await client.callTool({
      name: "diagnose",
      arguments: { verbose: true, output: "table", debug: true } as unknown as Record<string, never>,
    });
    expect(baseline.isError).not.toBe(true);
    expect(withExtras.isError).not.toBe(true);
    const baseReport = DiagnosticReportSchema.parse(JSON.parse(firstTextFromMcpResult(baseline)));
    const extrasReport = DiagnosticReportSchema.parse(JSON.parse(firstTextFromMcpResult(withExtras)));
    expect(extrasReport.results.length).toBe(baseReport.results.length);
    expect(extrasReport.results.map((r) => r.checkId)).toEqual(baseReport.results.map((r) => r.checkId));
    // schemaVersion / authMode / profile / configPath are stable across calls.
    expect(extrasReport.schemaVersion).toBe(baseReport.schemaVersion);
    expect(extrasReport.authMode).toBe(baseReport.authMode);
    expect(extrasReport.profile).toBe(baseReport.profile);
    expect(extrasReport.configPath).toBe(baseReport.configPath);
  });

  it("redaction audit: JSON output contains no IBANs, JWTs, or PAN-like number runs", async () => {
    const result = await client.callTool({ name: "diagnose", arguments: {} });
    const text = firstTextFromMcpResult(result);
    expect(text).not.toMatch(/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+/);
    expect(text).not.toMatch(/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/);
    expect(text).not.toMatch(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/);
    expect(text).not.toMatch(/\b\d{13,19}\b/);
  });
});

/**
 * #658 regression at the integration seam: the umbrella `qontoctl mcp
 * --profile <name>` server must resolve the `diagnose` tool through the launch
 * profile, exactly like the data tools. Reproduces the reported scenario —
 * credentials live ONLY in a profile file (`~/.qontoctl/<profile>.yaml`), with
 * NO `QONTOCTL_CONFIG_FILE` env — by pointing the spawned server's HOME at a
 * temp dir holding that profile file. Before the fix, `diagnose` (no args)
 * ignored the launch `--profile` and reported "No credentials found".
 *
 * The profile config is built from `getCredentials()` (env in CI, file
 * locally) rather than copying the repo `.qontoctl.yaml`, so it works in CI
 * (which has no repo config file, only api-key env secrets).
 */
describe.skipIf(!hasApiKeyCredentials())("diagnose MCP — launch --profile resolution (e2e, #658)", () => {
  const PROFILE = "e2e-profile";
  let client: Client;
  let transport: StdioClientTransport;
  let tempHome: string;

  beforeAll(async () => {
    tempHome = mkdtempSync(join(tmpdir(), "qontoctl-mcp-profile-e2e-"));
    mkdirSync(join(tempHome, ".qontoctl"), { recursive: true });

    const creds = getCredentials();
    const apiKey: Record<string, string> = {};
    if (creds.organizationSlug !== undefined) apiKey["organization-slug"] = creds.organizationSlug;
    if (creds.secretKey !== undefined) apiKey["secret-key"] = creds.secretKey;
    const configObj: Record<string, unknown> = { "api-key": apiKey, auth: { preference: "api-key" } };
    // Preserve sandbox routing when a staging token is configured (local), so
    // requests hit the same host as the env-path suite above.
    if (creds.stagingToken !== undefined) configObj["oauth"] = { "staging-token": creds.stagingToken };
    writeFileSync(join(tempHome, ".qontoctl", `${PROFILE}.yaml`), stringifyYaml(configObj));

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      HOME: tempHome,
      USERPROFILE: tempHome, // Windows home resolution
      QONTOCTL_AUTH: "api-key",
    };
    // Critical: the launch profile must be the ONLY resolution path. Drop any
    // ambient QONTOCTL_CONFIG_FILE (cliEnv injects one) so the test proves
    // `--profile` — not the env var — drives diagnose's resolution.
    delete env["QONTOCTL_CONFIG_FILE"];

    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp", "--profile", PROFILE],
      env,
      stderr: "pipe",
    });
    client = new Client({ name: "diagnose-profile-e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("resolves diagnose (no args) through the launch --profile and surfaces it", async () => {
    const result = await client.callTool({ name: "diagnose", arguments: {} });
    expect(result.isError).not.toBe(true);
    const report = DiagnosticReportSchema.parse(JSON.parse(firstTextFromMcpResult(result)));
    expect(report.results.length).toBe(9);
    // The launch profile is honored (resolution) AND surfaced (display).
    expect(report.profile).toBe(PROFILE);
  });
});
