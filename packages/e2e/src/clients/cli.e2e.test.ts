// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { ClientSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("client commands (e2e)", () => {
  describe("client list", () => {
    it("lists clients", () => {
      const output = cli("client", "list");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "client", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("client CRUD lifecycle", () => {
    let createdClientId: string | undefined;

    it("creates a client", () => {
      const output = cli(
        "--output",
        "json",
        "client",
        "create",
        "--name",
        "E2E Test Client",
        "--kind",
        "company",
        "--email",
        "e2e-test@example.com",
        "--country-code",
        "FR",
      );
      const parsed = JSON.parse(output) as Record<string, unknown>;
      ClientSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("name", "E2E Test Client");
      expect(parsed).toHaveProperty("kind", "company");
      createdClientId = parsed["id"] as string;
    });

    it("shows the created client", () => {
      if (createdClientId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client", "show", createdClientId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdClientId);
      expect(parsed).toHaveProperty("name", "E2E Test Client");
    });

    it("updates the created client", () => {
      if (createdClientId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client", "update", createdClientId, "--name", "E2E Updated Client");
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdClientId);
    });

    it("deletes the created client", () => {
      if (createdClientId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client", "delete", createdClientId, "--yes");
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
    });
  });

  describe("client delete without --yes", () => {
    it("exits with error when --yes is not provided", () => {
      try {
        cli("client", "delete", "00000000-0000-0000-0000-000000000000");
        // Should not reach here
        expect.fail("Expected command to exit with non-zero code");
      } catch (error: unknown) {
        // execFileSync throws on non-zero exit code
        const execError = error as { status: number; stderr: Buffer };
        expect(execError.status).toBe(1);
      }
    });
  });
});
