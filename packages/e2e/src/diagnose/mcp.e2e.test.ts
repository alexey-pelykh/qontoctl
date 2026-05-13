// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DiagnosticReportSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

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
