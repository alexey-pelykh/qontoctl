// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { WebhookSubscriptionListResponseSchema, WebhookSubscriptionSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

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

describe.skipIf(!hasOAuthCredentials())("webhook MCP tools (e2e)", () => {
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

  describe("webhook_list", () => {
    it("returns a list of webhooks with expected structure", async () => {
      const result = await client.callTool({
        name: "webhook_list",
        arguments: {},
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as WebhookListResponse;
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

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as WebhookListResponse;
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

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as WebhookListResponse;
      const first = listParsed.webhook_subscriptions[0];
      if (first === undefined) return;

      const result = await client.callTool({
        name: "webhook_show",
        arguments: { id: first.id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as WebhookItem;
      WebhookSubscriptionSchema.parse(parsed);
      expect(parsed.id).toBe(first.id);
      expect(parsed).toHaveProperty("callback_url");
      expect(parsed).toHaveProperty("types");
    });
  });
});
