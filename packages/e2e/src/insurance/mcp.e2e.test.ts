// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InsuranceContractSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("insurance MCP tools (e2e)", () => {
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

  describe("insurance CRUD lifecycle", () => {
    let createdId: string | undefined;

    it("creates an insurance contract", async () => {
      const result = await client.callTool({
        name: "insurance_create",
        arguments: {
          name: "E2E MCP ProLiability Plan",
          contract_id: `e2e-mcp-${Date.now()}`,
          origin: "qonto_other",
          provider_slug: "axa",
          type: "professional_liability",
          status: "active",
          payment_frequency: "annual",
          price_value: "99.99",
          price_currency: "EUR",
          start_date: "2026-01-01",
        },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      InsuranceContractSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("type", "professional_liability");
      createdId = parsed["id"] as string;
    });

    it("shows the created insurance contract", async () => {
      if (createdId === undefined) return;

      const result = await client.callTool({
        name: "insurance_show",
        arguments: { id: createdId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      InsuranceContractSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", createdId);
    });

    it("updates the created insurance contract", async () => {
      if (createdId === undefined) return;

      const result = await client.callTool({
        name: "insurance_update",
        arguments: {
          id: createdId,
          provider_slug: "allianz",
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdId);
      expect(parsed).toHaveProperty("provider_slug", "allianz");
    });
  });
});
