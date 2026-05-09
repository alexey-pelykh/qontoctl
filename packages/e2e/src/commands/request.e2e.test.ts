// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { RequestSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { SKIP, skipIfQontoStatus } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("request commands (e2e)", () => {
  describe("request list", () => {
    it("lists requests or returns gracefully on 403", () => {
      // The requests endpoint may return 403 if the organization
      // plan does not include request management.
      const output = skipIfQontoStatus([403], "request", "list");
      if (output === SKIP) return;
      expect(output).toBeTruthy();
    });

    it("produces valid JSON with --output json", () => {
      const output = skipIfQontoStatus([403], "--output", "json", "request", "list");
      if (output === SKIP) return;
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
