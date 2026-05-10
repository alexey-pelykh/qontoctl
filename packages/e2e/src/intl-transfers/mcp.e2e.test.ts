// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { IntlTransferRequirementsResponseSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("intl-transfer MCP tools (e2e)", () => {
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

  describe("intl_transfer_requirements", () => {
    it("returns requirements for a beneficiary", async () => {
      // First list intl beneficiaries to get an ID
      const listResult = await client.callTool({
        name: "intl_beneficiary_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        international_beneficiaries: { id: string }[];
      };
      if (listParsed.international_beneficiaries.length === 0) return;

      const id = (listParsed.international_beneficiaries[0] as { id: string }).id;

      const result = await client.callTool({
        name: "intl_transfer_requirements",
        arguments: { id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      IntlTransferRequirementsResponseSchema.parse(parsed);
    });
  });
});
