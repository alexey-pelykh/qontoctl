// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
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

describe.skipIf(!hasCredentials())("internal-transfer CLI commands (e2e)", () => {
  describe("internal-transfer create", () => {
    it("rejects create with missing required options", () => {
      try {
        cli("internal-transfer", "create");
        expect.fail("Expected command to exit with non-zero code");
      } catch (error: unknown) {
        const execError = error as { status: number; stderr: Buffer };
        expect(execError.status).not.toBe(0);
      }
    });
  });
});
