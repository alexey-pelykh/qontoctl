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

function cliJson<T>(...args: string[]): T {
  const output = cli(...args, "--output", "json");
  return JSON.parse(output) as T;
}

describe.skipIf(!hasCredentials())("intl-transfer CLI commands (e2e)", () => {
  describe("intl-transfer requirements", () => {
    it("returns requirements for a beneficiary", () => {
      // First list intl beneficiaries to get an ID
      let beneficiaries: { id: string }[];
      try {
        beneficiaries = cliJson<{ id: string }[]>("intl-beneficiary", "list");
      } catch {
        return;
      }
      if (beneficiaries.length === 0) return;

      const id = (beneficiaries[0] as { id: string }).id;
      const output = cli("--output", "json", "intl-transfer", "requirements", id);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("requirements");
    });
  });
});
