// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PaymentLinkListResponseSchema, PaymentLinkSchema } from "@qontoctl/core";
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

describe.skipIf(!hasCredentials())("MCP payment link tools (e2e)", () => {
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

  describe("payment_link_list", () => {
    it("returns a list of payment links with expected structure", async () => {
      const result = await client.callTool({
        name: "payment_link_list",
        arguments: {},
      });

      const parsed = JSON.parse(firstText(result)) as {
        payment_links: unknown[];
        meta: Record<string, unknown>;
      };
      PaymentLinkListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("payment_links");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.payment_links)).toBe(true);
    });
  });

  describe("payment_link_show", () => {
    it("returns details for a specific payment link", async () => {
      const listResult = await client.callTool({
        name: "payment_link_list",
        arguments: {},
      });
      const listParsed = JSON.parse(firstText(listResult)) as {
        payment_links: { id: string }[];
      };
      if (listParsed.payment_links.length === 0) {
        return; // No payment links in sandbox
      }

      const firstLink = listParsed.payment_links[0] as { id: string };
      const result = await client.callTool({
        name: "payment_link_show",
        arguments: { id: firstLink.id },
      });

      const parsed = JSON.parse(firstText(result)) as Record<string, unknown>;
      PaymentLinkSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", firstLink.id);
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("url");
    });
  });

  describe("payment_link_payments", () => {
    it("returns payments for a payment link", async () => {
      const listResult = await client.callTool({
        name: "payment_link_list",
        arguments: {},
      });
      const listParsed = JSON.parse(firstText(listResult)) as {
        payment_links: { id: string }[];
      };
      if (listParsed.payment_links.length === 0) {
        return; // No payment links in sandbox
      }

      const firstLink = listParsed.payment_links[0] as { id: string };
      const result = await client.callTool({
        name: "payment_link_payments",
        arguments: { id: firstLink.id },
      });

      const parsed = JSON.parse(firstText(result)) as {
        payments: unknown[];
        meta: Record<string, unknown>;
      };
      expect(parsed).toHaveProperty("payments");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.payments)).toBe(true);
    });
  });

  describe("payment_link_methods", () => {
    it("returns available payment methods", async () => {
      const result = await client.callTool({
        name: "payment_link_methods",
        arguments: {},
      });

      const parsed = JSON.parse(firstText(result)) as { name: string; enabled: boolean }[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const method of parsed) {
        expect(method).toHaveProperty("name");
        expect(method).toHaveProperty("enabled");
      }
    });
  });

  describe("payment_link_connection_status", () => {
    it("returns connection status", async () => {
      const result = await client.callTool({
        name: "payment_link_connection_status",
        arguments: {},
      });

      const parsed = JSON.parse(firstText(result)) as Record<string, unknown>;
      expect(parsed).toBeDefined();
    });
  });
});
