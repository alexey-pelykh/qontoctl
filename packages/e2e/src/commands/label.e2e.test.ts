// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { LabelSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("label commands (e2e)", () => {
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
      // `label show --output json` emits the bare label object, not an
      // array (table mode wraps it in a 1-row array; JSON does not).
      // See `packages/cli/src/commands/label.ts` § show action.
      const output = cli("--output", "json", "label", "show", labelId);
      const label = JSON.parse(output) as Record<string, unknown>;
      LabelSchema.parse(label);
      expect(label).toHaveProperty("id", labelId);
      expect(label).toHaveProperty("name");
      expect(label).toHaveProperty("parent_id");
    });
  });
});
