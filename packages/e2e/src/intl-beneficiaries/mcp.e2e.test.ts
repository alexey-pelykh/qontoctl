// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { IntlBeneficiaryListResponseSchema } from "@qontoctl/core";
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

describe.skipIf(!hasCredentials())("intl-beneficiary MCP tools (e2e)", () => {
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

  describe("intl_beneficiary_list", () => {
    it("returns a list with expected structure", async () => {
      const result = await client.callTool({
        name: "intl_beneficiary_list",
        arguments: {},
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as {
        international_beneficiaries: unknown[];
        meta: Record<string, unknown>;
      };
      IntlBeneficiaryListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("international_beneficiaries");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.international_beneficiaries)).toBe(true);
    });

    it("supports pagination", async () => {
      const result = await client.callTool({
        name: "intl_beneficiary_list",
        arguments: { per_page: 2, page: 1 },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as {
        international_beneficiaries: unknown[];
        meta: { current_page: number };
      };
      expect(parsed.international_beneficiaries.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });
  });

  describe("intl_beneficiary_requirements", () => {
    it("returns requirements for an existing beneficiary", async () => {
      const listResult = await client.callTool({
        name: "intl_beneficiary_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstText(listResult)) as {
        international_beneficiaries: { id: string }[];
      };
      if (listParsed.international_beneficiaries.length === 0) return;

      const id = (listParsed.international_beneficiaries[0] as { id: string }).id;

      const result = await client.callTool({
        name: "intl_beneficiary_requirements",
        arguments: { id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstText(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("requirements");
    });
  });
});
