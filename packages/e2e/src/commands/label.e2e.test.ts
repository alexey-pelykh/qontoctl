// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(
  import.meta.dirname,
  "../../../qontoctl/dist/cli.js",
);

/**
 * Run the CLI with the given arguments, inheriting credentials
 * from the environment.
 */
function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    timeout: 15_000,
  });
}

describe.skipIf(!hasCredentials())("label commands (e2e)", () => {
  describe("label list", () => {
    it("lists labels with id, name, parent_id", () => {
      const output = cli("label", "list");
      expect(output).toBeTruthy();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "label", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const item of parsed) {
        const label = item as Record<string, unknown>;
        expect(label).toHaveProperty("id");
        expect(label).toHaveProperty("name");
        expect(label).toHaveProperty("parent_id");
      }
    });
  });

  describe("label show", () => {
    it("shows label details including hierarchy fields", () => {
      // First, get a label ID from the list
      const listOutput = cli("--output", "json", "label", "list");
      const labels = JSON.parse(listOutput) as { id: string; name: string; parent_id: string }[];
      if (labels.length === 0) {
        return; // No labels in sandbox — nothing to show
      }

      const firstLabel = labels[0];
      expect(firstLabel).toBeDefined();
      const labelId = (firstLabel as { id: string }).id;
      const output = cli("--output", "json", "label", "show", labelId);
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);

      const label = parsed[0] as Record<string, unknown>;
      expect(label).toHaveProperty("id", labelId);
      expect(label).toHaveProperty("name");
      expect(label).toHaveProperty("parent_id");
    });
  });
});
