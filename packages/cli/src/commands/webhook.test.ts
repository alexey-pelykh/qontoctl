// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createWebhookCommand } from "./webhook.js";
import type { PaginationMeta } from "../pagination.js";

function makeMeta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 0,
    per_page: 100,
    ...overrides,
  };
}

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

describe("webhook commands", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("webhook list", () => {
    it("lists webhooks in table format", async () => {
      const webhooks = [
        {
          id: "wh-1",
          url: "https://example.com/hook1",
          event_types: ["transactions.created"],
          status: "enabled",
          secret: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "wh-2",
          url: "https://example.com/hook2",
          event_types: ["transactions.created", "transactions.updated"],
          status: "enabled",
          secret: null,
          created_at: "2026-01-02T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          webhook_subscriptions: webhooks,
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(["webhook", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("wh-1");
      expect(output).toContain("https://example.com/hook1");
      expect(output).toContain("wh-2");
      expect(output).toContain("https://example.com/hook2");
    });

    it("lists webhooks in json format", async () => {
      const webhooks = [
        {
          id: "wh-1",
          url: "https://example.com/hook",
          event_types: ["transactions.created"],
          status: "enabled",
          secret: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          webhook_subscriptions: webhooks,
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "webhook", "list"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        id: "wh-1",
        url: "https://example.com/hook",
        event_types: ["transactions.created"],
        status: "enabled",
        secret: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      });
    });

    it("passes pagination options to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          webhook_subscriptions: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(["--page", "2", "--per-page", "50", "webhook", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("50");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          webhook_subscriptions: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(["webhook", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/webhook_subscriptions");
    });
  });

  describe("webhook show", () => {
    const sampleWebhook = {
      id: "wh-1",
      url: "https://example.com/hook",
      event_types: ["transactions.created"],
      status: "enabled",
      secret: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    it("shows webhook details in json format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: sampleWebhook }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "webhook", "show", "wh-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "wh-1");
      expect(parsed).toHaveProperty("url", "https://example.com/hook");
      expect(parsed).toHaveProperty("event_types", ["transactions.created"]);
      expect(parsed).toHaveProperty("status", "enabled");
    });

    it("shows webhook details in table format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: sampleWebhook }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(["webhook", "show", "wh-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("wh-1");
      expect(output).toContain("https://example.com/hook");
      expect(output).toContain("transactions.created");
      expect(output).toContain("enabled");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: sampleWebhook }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(["webhook", "show", "wh-1"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/webhook_subscriptions/wh-1");
    });
  });

  describe("webhook create", () => {
    const createdWebhook = {
      id: "wh-new",
      url: "https://example.com/hook",
      event_types: ["transactions.created", "transactions.updated"],
      status: "enabled",
      secret: "generated-secret",
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };

    it("creates a webhook in json format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: createdWebhook }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(
        [
          "--output",
          "json",
          "webhook",
          "create",
          "--url",
          "https://example.com/hook",
          "--events",
          "transactions.created",
          "transactions.updated",
        ],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "wh-new");
      expect(parsed).toHaveProperty("url", "https://example.com/hook");
      expect(parsed).toHaveProperty("event_types", ["transactions.created", "transactions.updated"]);
    });

    it("sends POST to the correct endpoint with body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: createdWebhook }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(
        ["webhook", "create", "--url", "https://example.com/hook", "--events", "transactions.created"],
        { from: "user" },
      );

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/webhook_subscriptions");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        url: "https://example.com/hook",
        event_types: ["transactions.created"],
      });
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: createdWebhook }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(
        [
          "webhook",
          "create",
          "--url",
          "https://example.com/hook",
          "--events",
          "transactions.created",
          "--idempotency-key",
          "key-abc-123",
        ],
        { from: "user" },
      );

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-abc-123");
    });
  });

  describe("webhook update", () => {
    const updatedWebhook = {
      id: "wh-1",
      url: "https://example.com/new-hook",
      event_types: ["transactions.created"],
      status: "enabled",
      secret: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };

    it("updates a webhook in json format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: updatedWebhook }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(
        ["--output", "json", "webhook", "update", "wh-1", "--url", "https://example.com/new-hook"],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "wh-1");
      expect(parsed).toHaveProperty("url", "https://example.com/new-hook");
    });

    it("sends PUT to the correct endpoint with body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: updatedWebhook }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(
        [
          "webhook",
          "update",
          "wh-1",
          "--url",
          "https://example.com/new-hook",
          "--events",
          "transactions.created",
          "transactions.updated",
        ],
        { from: "user" },
      );

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/webhook_subscriptions/wh-1");
      expect(opts.method).toBe("PUT");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        url: "https://example.com/new-hook",
        event_types: ["transactions.created", "transactions.updated"],
      });
    });
  });

  describe("webhook delete", () => {
    it("deletes a webhook with --yes flag", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "webhook", "delete", "wh-1", "--yes"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
      expect(parsed).toHaveProperty("id", "wh-1");
    });

    it("sends DELETE to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(["webhook", "delete", "wh-1", "--yes"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/webhook_subscriptions/wh-1");
      expect(opts.method).toBe("DELETE");
    });

    it("exits with error when --yes is not provided", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createWebhookCommand());
      program.exitOverride();

      await program.parseAsync(["webhook", "delete", "wh-1"], { from: "user" });

      expect(stderrSpy).toHaveBeenCalled();
      const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
      expect(errorOutput).toContain("About to delete webhook subscription wh-1");
      expect(errorOutput).toContain("--yes");
      expect(process.exitCode).toBe(1);
    });
  });
});
