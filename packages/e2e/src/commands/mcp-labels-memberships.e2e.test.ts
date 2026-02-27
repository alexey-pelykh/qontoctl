// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

/**
 * Extract the text content from a single-entry MCP tool result.
 */
function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text: string }[];
  expect(content).toHaveLength(1);
  const entry = content[0] as { type: string; text: string };
  expect(entry.type).toBe("text");
  return entry.text;
}

describe.skipIf(!hasCredentials())("MCP label & membership tools (e2e)", () => {
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

  describe("label_list", () => {
    it("returns a list of labels with expected structure", async () => {
      const result = await client.callTool({
        name: "label_list",
        arguments: {},
      });

      const parsed = JSON.parse(firstText(result)) as {
        labels: unknown[];
        meta: Record<string, unknown>;
      };
      expect(parsed).toHaveProperty("labels");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.labels)).toBe(true);

      for (const item of parsed.labels) {
        const label = item as Record<string, unknown>;
        expect(label).toHaveProperty("id");
        expect(label).toHaveProperty("name");
        expect(label).toHaveProperty("parent_id");
      }
    });
  });

  describe("label_show", () => {
    it("returns details for a specific label", async () => {
      // First, get a label ID from the list
      const listResult = await client.callTool({
        name: "label_list",
        arguments: {},
      });
      const listParsed = JSON.parse(firstText(listResult)) as {
        labels: { id: string }[];
      };
      if (listParsed.labels.length === 0) {
        return; // No labels in sandbox
      }

      const firstLabel = listParsed.labels[0];
      expect(firstLabel).toBeDefined();
      const labelId = (firstLabel as { id: string }).id;

      const result = await client.callTool({
        name: "label_show",
        arguments: { id: labelId },
      });

      const parsed = JSON.parse(firstText(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", labelId);
      expect(parsed).toHaveProperty("name");
      expect(parsed).toHaveProperty("parent_id");
    });
  });

  describe("membership_list", () => {
    it("returns a list of memberships with expected structure", async () => {
      const result = await client.callTool({
        name: "membership_list",
        arguments: {},
      });

      const parsed = JSON.parse(firstText(result)) as {
        memberships: unknown[];
        meta: Record<string, unknown>;
      };
      expect(parsed).toHaveProperty("memberships");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.memberships)).toBe(true);

      for (const item of parsed.memberships) {
        const membership = item as Record<string, unknown>;
        expect(membership).toHaveProperty("id");
        expect(membership).toHaveProperty("first_name");
        expect(membership).toHaveProperty("last_name");
        expect(membership).toHaveProperty("role");
        expect(membership).toHaveProperty("team_id");
        expect(membership).toHaveProperty("status");
      }
    });
  });
});
