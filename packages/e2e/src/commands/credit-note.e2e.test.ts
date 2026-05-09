// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { CreditNoteSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("credit-note commands (e2e)", () => {
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
