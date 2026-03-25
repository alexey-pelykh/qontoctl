// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { CreditNoteSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

/**
 * Run the CLI with the given arguments, inheriting credentials
 * from the environment.
 */
function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    cwd: cliCwd(),
    timeout: 15_000,
  });
}

describe.skipIf(!hasCredentials())("credit-note commands (e2e)", () => {
  describe("credit-note list", () => {
    it("lists credit notes without error", () => {
      const output = cli("credit-note", "list");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "credit-note", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("credit-note show", () => {
    it("shows credit note details when available", () => {
      const listOutput = cli("--output", "json", "credit-note", "list");
      const creditNotes = JSON.parse(listOutput) as { id: string }[];
      if (creditNotes.length === 0) {
        return; // No credit notes in account — nothing to show
      }

      const firstCreditNote = creditNotes[0];
      expect(firstCreditNote).toBeDefined();
      const creditNoteId = (firstCreditNote as { id: string }).id;
      const output = cli("--output", "json", "credit-note", "show", creditNoteId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      CreditNoteSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", creditNoteId);
      expect(parsed).toHaveProperty("number");
      expect(parsed).toHaveProperty("currency");
    });
  });
});
