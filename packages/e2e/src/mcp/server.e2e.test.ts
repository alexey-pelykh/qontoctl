// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

const EXPECTED_TOOLS = [
  "org_show",
  "account_list",
  "account_show",
  "credit_note_list",
  "credit_note_show",
  "einvoicing_settings",
  "transaction_list",
  "transaction_show",
  "transfer_list",
  "transfer_show",
  "statement_list",
  "statement_show",
  "label_list",
  "label_show",
  "membership_list",
  "request_list",
] as const;

describe("MCP server via stdio (e2e)", () => {
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

  it("responds to initialize and connects successfully", () => {
    // client.connect() already performed the initialize handshake;
    // reaching this point means the server responded correctly
    expect(client).toBeDefined();
  });

  describe("tools/list", () => {
    it("lists all 16 expected tools", async () => {
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
