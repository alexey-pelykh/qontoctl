// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EInvoicingSettingsSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("e-invoicing MCP (e2e)", () => {
  pinAuthPreference("oauth-first");

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

    const settings = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
    EInvoicingSettingsSchema.parse(settings);
    expect(settings).toHaveProperty("sending_status");
    expect(settings).toHaveProperty("receiving_status");
    expect(typeof settings["sending_status"]).toBe("string");
    expect(typeof settings["receiving_status"]).toBe("string");
  });
});
