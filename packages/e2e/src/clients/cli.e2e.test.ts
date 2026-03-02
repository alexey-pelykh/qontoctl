// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    timeout: 30_000,
  });
}

describe.skipIf(!hasCredentials())("client commands (e2e)", () => {
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
