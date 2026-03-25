// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { WebhookSubscriptionSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    cwd: cliCwd(),
    timeout: 30_000,
  });
}

function cliJson<T>(...args: string[]): T {
  const output = cli(...args, "--output", "json");
  return JSON.parse(output) as T;
}

interface WebhookItem {
  readonly id: string;
  readonly callback_url: string;
  readonly types: string[];
}

describe.skipIf(!hasCredentials())("webhook CLI commands (e2e)", () => {
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
    it("shows a webhook by ID", () => {
      const webhooks = cliJson<WebhookItem[]>("webhook", "list", "--per-page", "1");
      const first = webhooks[0];
      if (first === undefined) return;

      const webhook = cliJson<WebhookItem>("webhook", "show", first.id);
      WebhookSubscriptionSchema.parse(webhook);
      expect(webhook.id).toBe(first.id);
      expect(webhook).toHaveProperty("callback_url");
      expect(webhook).toHaveProperty("types");
    });
  });

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
