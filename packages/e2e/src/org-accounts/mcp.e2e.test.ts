// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { BankAccountSchema, OrganizationSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("organization & accounts MCP (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  // ── org_show ───────────────────────────────────────────────────

  it("org_show returns organization details", async () => {
    const result = await client.callTool({
      name: "org_show",
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    expect(result.content).toBeDefined();

    const org = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
    OrganizationSchema.parse(org);
    expect(org).toHaveProperty("slug");
    expect(org).toHaveProperty("legal_name");
    expect(org).toHaveProperty("bank_accounts");
    expect(typeof org["slug"]).toBe("string");
    expect(typeof org["legal_name"]).toBe("string");
    expect(Array.isArray(org["bank_accounts"])).toBe(true);
  });

  // ── account_list ───────────────────────────────────────────────

  it("account_list returns bank accounts", async () => {
    const result = await client.callTool({
      name: "account_list",
      arguments: {},
    });
    expect(result.isError).not.toBe(true);

    const accounts = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>[];
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThan(0);

    const account = accounts[0] as Record<string, unknown>;
    expect(account).toHaveProperty("id");
    expect(account).toHaveProperty("name");
    expect(account).toHaveProperty("iban");
    expect(account).toHaveProperty("balance");
    expect(account).toHaveProperty("currency");
    expect(account).toHaveProperty("status");
  });

  // ── account_show ───────────────────────────────────────────────

  it("account_show returns details for a specific account", async () => {
    // First, get an account ID from account_list
    const listResult = await client.callTool({
      name: "account_list",
      arguments: {},
    });
    const accounts = JSON.parse(firstTextFromMcpResult(listResult)) as { id: string }[];
    const accountId = (accounts[0] as { id: string }).id;

    const result = await client.callTool({
      name: "account_show",
      arguments: { id: accountId },
    });
    expect(result.isError).not.toBe(true);

    const account = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
    BankAccountSchema.parse(account);
    expect(account).toHaveProperty("id", accountId);
    expect(account).toHaveProperty("name");
    expect(account).toHaveProperty("iban");
    expect(account).toHaveProperty("bic");
    expect(account).toHaveProperty("balance");
    expect(account).toHaveProperty("authorized_balance");
    expect(account).toHaveProperty("currency");
    expect(account).toHaveProperty("status");
  });

  // ── account_iban_certificate ─────────────────────────────────

  it("account_iban_certificate returns PDF as embedded resource", async () => {
    // First, get an account ID from account_list
    const listResult = await client.callTool({
      name: "account_list",
      arguments: {},
    });
    const accounts = JSON.parse(firstTextFromMcpResult(listResult)) as { id: string }[];
    const accountId = (accounts[0] as { id: string }).id;

    const result = await client.callTool({
      name: "account_iban_certificate",
      arguments: { id: accountId },
    });

    // The IBAN-certificate endpoint requires the organization to be
    // KYB-validated. Sandbox test orgs and Qonto-issued test API-key
    // orgs are typically not KYB-accepted, surfacing as MCP
    // `isError: true` with text `Qonto API error (HTTP 400): …
    // iban_generation_failed: Organization is not KYB accepted`. Skip
    // rather than fail in that environmental case (#511); KYB-validated
    // orgs still exercise the full PDF download path. Mirrors the CLI
    // test's `skipIfQontoErrorContains([400], ["KYB accepted"])` pattern.
    if (result.isError === true) {
      const errorText = (result.content as { type: string; text?: string }[])[0]?.text ?? "";
      if (errorText.includes("KYB accepted")) {
        console.warn(
          `[e2e] skipping: account_iban_certificate -> HTTP 400 matching "KYB accepted" (known environmental limitation)`,
        );
        return;
      }
      throw new Error(`account_iban_certificate failed unexpectedly: ${errorText}`);
    }

    const content = result.content as { type: string; resource?: { blob: string; mimeType: string } }[];
    expect(content).toHaveLength(1);
    expect((content[0] as { type: string }).type).toBe("resource");

    const resource = (content[0] as { resource: { blob: string; mimeType: string } }).resource;
    expect(resource.mimeType).toBe("application/pdf");
    expect(resource.blob).toBeDefined();

    // Verify it's valid base64 that decodes to a PDF
    const pdfBuffer = Buffer.from(resource.blob, "base64");
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString("ascii", 0, 4)).toBe("%PDF");
  });
});
