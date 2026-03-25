// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

const EXPECTED_TOOLS = [
  "org_show",
  "account_list",
  "account_show",
  "account_iban_certificate",
  "account_create",
  "account_update",
  "account_close",
  "beneficiary_list",
  "beneficiary_show",
  "beneficiary_add",
  "beneficiary_update",
  "beneficiary_trust",
  "beneficiary_untrust",
  "card_list",
  "card_show",
  "card_create",
  "card_bulk_create",
  "card_lock",
  "card_unlock",
  "card_report_lost",
  "card_report_stolen",
  "card_discard",
  "card_update_limits",
  "card_update_nickname",
  "card_update_options",
  "card_update_restrictions",
  "card_iframe_url",
  "card_appearances",
  "bulk_transfer_list",
  "bulk_transfer_show",
  "credit_note_list",
  "credit_note_show",
  "einvoicing_settings",
  "internal_transfer_create",
  "intl_beneficiary_add",
  "intl_beneficiary_list",
  "intl_beneficiary_remove",
  "intl_beneficiary_requirements",
  "intl_beneficiary_update",
  "intl_transfer_create",
  "intl_transfer_requirements",
  "recurring_transfer_list",
  "recurring_transfer_show",
  "transaction_list",
  "transaction_show",
  "transfer_list",
  "transfer_show",
  "transfer_create",
  "transfer_cancel",
  "transfer_proof",
  "transfer_verify_payee",
  "transfer_bulk_verify_payee",
  "statement_list",
  "statement_show",
  "label_list",
  "label_show",
  "membership_list",
  "membership_show",
  "membership_invite",
  "quote_list",
  "quote_show",
  "quote_create",
  "quote_update",
  "quote_delete",
  "quote_send",
  "request_list",
  "request_approve",
  "request_decline",
  "request_create_flash_card",
  "request_create_virtual_card",
  "request_create_multi_transfer",
  "supplier_invoice_list",
  "supplier_invoice_show",
  "supplier_invoice_bulk_create",
  "attachment_upload",
  "attachment_show",
  "transaction_attachment_list",
  "transaction_attachment_add",
  "transaction_attachment_remove",
  "client_list",
  "client_show",
  "client_create",
  "client_update",
  "client_delete",
  "client_invoice_list",
  "client_invoice_show",
  "client_invoice_create",
  "client_invoice_update",
  "client_invoice_delete",
  "client_invoice_finalize",
  "client_invoice_send",
  "client_invoice_mark_paid",
  "client_invoice_unmark_paid",
  "client_invoice_cancel",
  "client_invoice_upload",
  "client_invoice_upload_show",
  "team_list",
  "team_create",
  "webhook_list",
  "webhook_show",
  "webhook_create",
  "webhook_update",
  "webhook_delete",
  "insurance_show",
  "insurance_create",
  "insurance_update",
  "insurance_upload_document",
  "insurance_remove_document",
] as const;

describe("MCP server via stdio (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      cwd: cliCwd(),
      stderr: "pipe",
    });
    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it("responds to initialize and connects successfully", () => {
    // client.connect() already performed the initialize handshake;
    // reaching this point means the server responded correctly
    expect(client).toBeDefined();
  });

  describe("tools/list", () => {
    it("lists all expected tools", async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);

      for (const expected of EXPECTED_TOOLS) {
        expect(names, `missing tool: ${expected}`).toContain(expected);
      }
      expect(tools).toHaveLength(EXPECTED_TOOLS.length);
    });

    it("each tool has a description", async () => {
      const { tools } = await client.listTools();

      for (const tool of tools) {
        expect(tool.description, `${tool.name} should have a description`).toBeTruthy();
      }
    });

    it("each tool has an input schema", async () => {
      const { tools } = await client.listTools();

      for (const tool of tools) {
        expect(tool.inputSchema, `${tool.name} should have an inputSchema`).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });
  });

  describe.skipIf(!hasCredentials())("tool call with valid credentials", () => {
    it("org_show returns organization data in MCP content format", async () => {
      const result = await client.callTool({ name: "org_show", arguments: {} });

      expect(result.isError).toBeFalsy();
      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      expect(first.type).toBe("text");

      const parsed: unknown = JSON.parse(first.text);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe("object");
    });
  });
});

describe("MCP server with no credentials (e2e)", () => {
  let tempHome: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    tempHome = mkdtempSync(join(tmpdir(), "qontoctl-mcp-e2e-"));

    // Strip all QONTOCTL_* env vars and point HOME to an empty temp dir
    // so resolveConfig finds no config file and no env credentials.
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith("QONTOCTL_") && value !== undefined) {
        cleanEnv[key] = value;
      }
    }
    cleanEnv["HOME"] = tempHome;

    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cleanEnv,
      stderr: "pipe",
      cwd: tempHome,
    });
    client = new Client({ name: "e2e-no-creds", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("returns isError with guidance when calling a tool without credentials", async () => {
    const result = await client.callTool({ name: "org_show", arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content).toHaveLength(1);
    const first = content[0] as { type: string; text: string };
    expect(first.type).toBe("text");
    expect(first.text.toLowerCase()).toContain("error");
  });
});
