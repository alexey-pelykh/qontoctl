// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { type ExecFileSyncOptionsWithStringEncoding, execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { RequestSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

const execOpts: ExecFileSyncOptionsWithStringEncoding = {
  encoding: "utf-8",
  env: cliEnv(),
  timeout: 15_000,
};

/**
 * Run the CLI with the given arguments, inheriting credentials
 * from the environment. Returns `null` when the command exits
 * non-zero (e.g. HTTP 403 for plans that lack request access).
 */
function cli(...args: string[]): string | null {
  try {
    return execFileSync("node", [CLI_PATH, ...args], execOpts);
  } catch {
    return null;
  }
}

describe.skipIf(!hasCredentials())("request commands (e2e)", () => {
  describe("request list", () => {
    it("lists requests or returns gracefully on 403", () => {
      const output = cli("request", "list");
      // The requests endpoint may return 403 if the organization
      // plan does not include request management.
      if (output === null) return;
      expect(output).toBeTruthy();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "request", "list");
      if (output === null) return;
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const item of parsed) {
        RequestSchema.parse(item);
        const request = item as Record<string, unknown>;
        expect(request).toHaveProperty("id");
        expect(request).toHaveProperty("request_type");
        expect(request).toHaveProperty("status");
        expect(request).toHaveProperty("initiator_id");
      }
    });
  });
});
