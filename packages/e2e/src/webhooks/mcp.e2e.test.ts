// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { WebhookSubscriptionListResponseSchema, WebhookSubscriptionSchema } from "@qontoctl/core";
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

interface WebhookItem {
  readonly id: string;
  readonly callback_url: string;
  readonly types: string[];
}

interface WebhookListResponse {
  readonly webhook_subscriptions: WebhookItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

describe.skipIf(!hasCredentials())("webhook MCP tools (e2e)", () => {
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

  describe("webhook_list", () => {
    it("returns a list of webhooks with expected structure", async () => {
      const result = await client.callTool({
        name: "webhook_list",
        arguments: {},
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as WebhookListResponse;
      WebhookSubscriptionListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("webhook_subscriptions");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.webhook_subscriptions)).toBe(true);
    });

    it("supports pagination", async () => {
      const result = await client.callTool({
        name: "webhook_list",
        arguments: { per_page: 2, page: 1 },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as WebhookListResponse;
      expect(parsed.webhook_subscriptions.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });
  });

  describe("webhook_show", () => {
    it("shows a webhook by ID", async () => {
      const listResult = await client.callTool({
        name: "webhook_list",
        arguments: { per_page: 1 },
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstText(listResult)) as WebhookListResponse;
      const first = listParsed.webhook_subscriptions[0];
      if (first === undefined) return;

      const result = await client.callTool({
        name: "webhook_show",
        arguments: { id: first.id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstText(result)) as WebhookItem;
      WebhookSubscriptionSchema.parse(parsed);
      expect(parsed.id).toBe(first.id);
      expect(parsed).toHaveProperty("callback_url");
      expect(parsed).toHaveProperty("types");
    });
  });
});
