// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InsuranceContractSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text: string }[];
  expect(content).toHaveLength(1);
  const entry = content[0] as { type: string; text: string };
  expect(entry.type).toBe("text");
  return entry.text;
}

describe.skipIf(!hasCredentials())("insurance MCP tools (e2e)", () => {
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

  describe("insurance CRUD lifecycle", () => {
    let createdId: string | undefined;

    it("creates an insurance contract", async () => {
      const result = await client.callTool({
        name: "insurance_create",
        arguments: {
          insurance_type: "professional_liability",
          provider_name: "E2E MCP Test Provider",
          start_date: "2026-01-01",
        },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as Record<string, unknown>;
      InsuranceContractSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("insurance_type", "professional_liability");
      createdId = parsed["id"] as string;
    });

    it("shows the created insurance contract", async () => {
      if (createdId === undefined) return;

      const result = await client.callTool({
        name: "insurance_show",
        arguments: { id: createdId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstText(result)) as Record<string, unknown>;
      InsuranceContractSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", createdId);
    });

    it("updates the created insurance contract", async () => {
      if (createdId === undefined) return;

      const result = await client.callTool({
        name: "insurance_update",
        arguments: {
          id: createdId,
          provider_name: "Updated E2E MCP Provider",
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstText(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdId);
      expect(parsed).toHaveProperty("provider_name", "Updated E2E MCP Provider");
    });
  });
});
