// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EInvoicingSettingsSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

describe.skipIf(!hasCredentials())("e-invoicing MCP (e2e)", () => {
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

  it("einvoicing_settings returns e-invoicing settings", async () => {
    const result = await client.callTool({
      name: "einvoicing_settings",
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    expect(result.content).toBeDefined();

    const content = result.content as { type: string; text: string }[];
    expect(content).toHaveLength(1);
    expect((content[0] as { type: string }).type).toBe("text");

    const settings = JSON.parse((content[0] as { text: string }).text) as Record<string, unknown>;
    EInvoicingSettingsSchema.parse(settings);
    expect(settings).toHaveProperty("sending_status");
    expect(settings).toHaveProperty("receiving_status");
    expect(typeof settings["sending_status"]).toBe("string");
    expect(typeof settings["receiving_status"]).toBe("string");
  });
});
