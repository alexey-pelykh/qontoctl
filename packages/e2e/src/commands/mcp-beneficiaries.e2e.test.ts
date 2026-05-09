// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { BeneficiaryListResponseSchema, BeneficiarySchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("MCP beneficiary tools (e2e)", () => {
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

  describe("beneficiary_list", () => {
    it("returns a list of beneficiaries with expected structure", async () => {
      const result = await client.callTool({
        name: "beneficiary_list",
        arguments: {},
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        beneficiaries: unknown[];
        meta: Record<string, unknown>;
      };
      BeneficiaryListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("beneficiaries");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.beneficiaries)).toBe(true);

      for (const item of parsed.beneficiaries) {
        const beneficiary = item as Record<string, unknown>;
        expect(beneficiary).toHaveProperty("id");
        expect(beneficiary).toHaveProperty("name");
        expect(beneficiary).toHaveProperty("iban");
        expect(beneficiary).toHaveProperty("status");
        expect(beneficiary).toHaveProperty("trusted");
      }
    });
  });

  describe("beneficiary_show", () => {
    it("returns details for a specific beneficiary", async () => {
      // First, get a beneficiary ID from the list
      const listResult = await client.callTool({
        name: "beneficiary_list",
        arguments: {},
      });
      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        beneficiaries: { id: string }[];
      };
      if (listParsed.beneficiaries.length === 0) {
        return; // No beneficiaries in sandbox
      }

      const first = listParsed.beneficiaries[0];
      expect(first).toBeDefined();
      const beneficiaryId = (first as { id: string }).id;

      const result = await client.callTool({
        name: "beneficiary_show",
        arguments: { id: beneficiaryId },
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      BeneficiarySchema.parse(parsed);
      expect(parsed).toHaveProperty("id", beneficiaryId);
      expect(parsed).toHaveProperty("name");
      expect(parsed).toHaveProperty("iban");
      expect(parsed).toHaveProperty("bic");
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("trusted");
    });
  });
});
