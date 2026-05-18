// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { WebhookSubscriptionListResponseSchema, WebhookSubscriptionSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLI_PATH,
  firstTextFromMcpResult,
  type LifecycleSkipCarrier,
  assertLifecycleState,
  skipIfToolError,
  skipIfUpstreamSkipped,
  skipMissingFixture,
} from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

interface WebhookItem {
  readonly id: string;
  readonly callback_url: string;
  readonly types: string[];
}

interface WebhookListResponse {
  readonly subscriptions: WebhookItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

// Stable webhook.site URL used purely as an opaque registration target — the
// test never receives or asserts on delivered events (per #452 AC item 2). The
// fixed UUID encodes #452 to make stray sandbox webhooks from failed runs easy
// to spot and clean up manually.
const TEST_CALLBACK_URL = "https://webhook.site/00000000-0000-0000-0000-000000000452";

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
    it("returns a list of webhooks with expected structure", async (ctx) => {
      const result = await client.callTool({
        name: "webhook_list",
        arguments: {},
      });

      skipIfToolError(result, ctx, "feature-not-supported", "webhook_list");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as WebhookListResponse;
      WebhookSubscriptionListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("subscriptions");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.subscriptions)).toBe(true);
    });

    it("supports pagination", async (ctx) => {
      const result = await client.callTool({
        name: "webhook_list",
        arguments: { per_page: 2, page: 1 },
      });

      skipIfToolError(result, ctx, "feature-not-supported", "webhook_list");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as WebhookListResponse;
      expect(parsed.subscriptions.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });
  });

  describe("webhook_show", () => {
    it("shows a webhook by ID", async (ctx) => {
      const listResult = await client.callTool({
        name: "webhook_list",
        arguments: { per_page: 1 },
      });
      skipIfToolError(listResult, ctx, "feature-not-supported", "webhook_list");

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as WebhookListResponse;
      const first = listParsed.subscriptions[0];
      if (first === undefined) {
        skipMissingFixture(ctx, "no webhooks in sandbox to resolve an id for webhook_show");
      }

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

  // MCP CRUD smoke for `webhook_create` / `webhook_update` / `webhook_delete` —
  // closes the audit gap from umbrella #449 (Group 3). Mirrors the CLI suite's
  // round-trip but exercises the operations through callTool so the MCP wrapper
  // contract is asserted on top of the underlying API contract.
  describe("webhook CRUD lifecycle (MCP)", () => {
    const lifecycleSkip: LifecycleSkipCarrier = { reason: undefined };
    let createdWebhookId: string | undefined;

    it("creates a webhook via callTool", async () => {
      const result = await client.callTool({
        name: "webhook_create",
        arguments: {
          callback_url: TEST_CALLBACK_URL,
          types: ["v1/transactions"],
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as WebhookItem;
      WebhookSubscriptionSchema.parse(parsed);
      expect(parsed.id).toBeDefined();
      expect(parsed.callback_url).toBe(TEST_CALLBACK_URL);
      expect(parsed.types).toContain("v1/transactions");
      createdWebhookId = parsed.id;
    });

    it("updates the webhook by widening the event filter", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdWebhookId, "createdWebhookId");

      // The Qonto API treats PUT as full-replacement (not partial) — sending
      // only `types` returns "HTTP 400: CallbackURL is missing", so the URL
      // has to be re-sent on every update even when unchanged. The MCP
      // surface mirrors that contract directly; auto-merge would be a UX
      // improvement but is out of scope for #452.
      const result = await client.callTool({
        name: "webhook_update",
        arguments: {
          id,
          callback_url: TEST_CALLBACK_URL,
          types: ["v1/transactions", "v1/cards"],
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as WebhookItem;
      WebhookSubscriptionSchema.parse(parsed);
      expect(parsed.id).toBe(id);
      expect(parsed.types).toEqual(expect.arrayContaining(["v1/transactions", "v1/cards"]));
    });

    it("deletes the webhook via callTool", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdWebhookId, "createdWebhookId");

      const result = await client.callTool({
        name: "webhook_delete",
        arguments: { id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as { deleted: boolean; id: string };
      expect(parsed.deleted).toBe(true);
      expect(parsed.id).toBe(id);
    });

    it("returns 404 when fetching the deleted webhook", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdWebhookId, "createdWebhookId");

      const result = await client.callTool({
        name: "webhook_show",
        arguments: { id },
      });

      expect(result.isError).toBe(true);
      // The MCP error wrapper surfaces `QontoApiError` as text content with the
      // human-readable "Qonto API error (HTTP 404):" prefix; assert on that
      // rather than re-parsing the structured shape.
      const text = firstTextFromMcpResult(result);
      expect(text).toMatch(/HTTP 404/);
    });
  });
});
