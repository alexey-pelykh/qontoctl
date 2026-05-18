// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { WebhookSubscriptionSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import {
  cli,
  cliJson,
  cliRaw,
  qontoHttpStatus,
  type LifecycleSkipCarrier,
  assertLifecycleState,
  skipIfUpstreamSkipped,
  skipMissingFixture,
} from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

interface WebhookItem {
  readonly id: string;
  readonly callback_url: string;
  readonly types: string[];
}

// Stable webhook.site URL used purely as an opaque registration target — the
// test never receives or asserts on delivered events (per #452 AC item 2). The
// fixed UUID encodes #452 to make stray sandbox webhooks from failed runs easy
// to spot and clean up manually.
const TEST_CALLBACK_URL = "https://webhook.site/00000000-0000-0000-0000-000000000452";

describe.skipIf(!hasOAuthCredentials())("webhook CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("webhook list", () => {
    it("lists webhooks with default output", () => {
      const output = cli("webhook", "list");
      expect(output).toBeDefined();
    });

    it("lists webhooks as JSON", () => {
      const webhooks = cliJson<WebhookItem[]>("webhook", "list");
      expect(Array.isArray(webhooks)).toBe(true);
      const first = webhooks[0];
      if (first !== undefined) {
        WebhookSubscriptionSchema.parse(first);
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("callback_url");
        expect(first).toHaveProperty("types");
      }
    });

    it("supports pagination", () => {
      const webhooks = cliJson<WebhookItem[]>("webhook", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(webhooks)).toBe(true);
      expect(webhooks.length).toBeLessThanOrEqual(2);
    });
  });

  describe("webhook show", () => {
    it("shows a webhook by ID", (ctx) => {
      const webhooks = cliJson<WebhookItem[]>("webhook", "list", "--per-page", "1");
      const first = webhooks[0];
      if (first === undefined) {
        skipMissingFixture(ctx, "no webhooks in sandbox to resolve an id for webhook show");
      }

      const webhook = cliJson<WebhookItem>("webhook", "show", first.id);
      WebhookSubscriptionSchema.parse(webhook);
      expect(webhook.id).toBe(first.id);
      expect(webhook).toHaveProperty("callback_url");
      expect(webhook).toHaveProperty("types");
    });
  });

  // Real CRUD round-trip against the live sandbox — closes the audit gap from
  // umbrella #449 (Group 3): webhook write paths were fully implemented but
  // entirely uncovered by E2E. Sequential `it` blocks share `createdWebhookId`
  // via closure, mirroring the pattern in `packages/e2e/src/clients/cli.e2e.test.ts`.
  describe("webhook CRUD lifecycle", () => {
    const lifecycleSkip: LifecycleSkipCarrier = { reason: undefined };
    let createdWebhookId: string | undefined;

    it("creates a webhook subscription", () => {
      const webhook = cliJson<WebhookItem>(
        "webhook",
        "create",
        "--url",
        TEST_CALLBACK_URL,
        "--events",
        "v1/transactions",
      );
      WebhookSubscriptionSchema.parse(webhook);
      expect(webhook.id).toBeDefined();
      expect(webhook.callback_url).toBe(TEST_CALLBACK_URL);
      expect(webhook.types).toContain("v1/transactions");
      createdWebhookId = webhook.id;
    });

    it("updates the webhook by widening the event filter", (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdWebhookId, "createdWebhookId");

      // The Qonto API treats PUT as full-replacement (not partial) — sending
      // only `types` returns "HTTP 400: CallbackURL is missing", so the URL
      // has to be re-sent on every update even when unchanged. The CLI
      // surface mirrors that contract directly; auto-merge would be a UX
      // improvement but is out of scope for #452.
      const webhook = cliJson<WebhookItem>(
        "webhook",
        "update",
        id,
        "--url",
        TEST_CALLBACK_URL,
        "--events",
        "v1/transactions",
        "v1/cards",
      );
      WebhookSubscriptionSchema.parse(webhook);
      expect(webhook.id).toBe(id);
      expect(webhook.types).toEqual(expect.arrayContaining(["v1/transactions", "v1/cards"]));
    });

    it("deletes the webhook via the API", (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdWebhookId, "createdWebhookId");

      const result = cliJson<{ deleted: boolean; id: string }>("webhook", "delete", id, "--yes");
      expect(result.deleted).toBe(true);
      expect(result.id).toBe(id);
    });

    it("returns 404 when fetching the deleted webhook", (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdWebhookId, "createdWebhookId");

      const result = cliRaw(["--output", "json", "webhook", "show", id]);
      expect(result.ok).toBe(false);
      // Narrow CliResult to the failure branch so `result.stderr` is accessible
      // — not a silent skip (the prior `expect(result.ok).toBe(false)` already
      // failed the test if `result.ok` were true).
      if (result.ok) return;
      expect(qontoHttpStatus(result.stderr)).toBe(404);
    });
  });

  // The local-only `--yes` confirmation guard is independent of the API
  // round-trip above — it asserts the CLI exits non-zero before any HTTP call
  // is made, so it complements (rather than duplicates) the lifecycle tests.
  describe("webhook delete without --yes", () => {
    it("exits with error when --yes is not provided", () => {
      try {
        cli("webhook", "delete", "00000000-0000-0000-0000-000000000000");
        expect.fail("Expected command to exit with non-zero code");
      } catch (error: unknown) {
        const execError = error as { status: number };
        expect(execError.status).toBe(1);
      }
    });
  });
});
