// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { InsuranceContractSchema } from "@qontoctl/core";
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

describe.skipIf(!hasCredentials())("insurance CLI commands (e2e)", () => {
  describe("insurance CRUD lifecycle", () => {
    let createdId: string | undefined;

    it("creates an insurance contract", () => {
      const output = cli(
        "--output",
        "json",
        "insurance",
        "create",
        "--insurance-type",
        "professional_liability",
        "--provider-name",
        "E2E Test Provider",
        "--start-date",
        "2026-01-01",
      );
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("insurance_type", "professional_liability");
      InsuranceContractSchema.parse(parsed);
      createdId = parsed["id"] as string;
    });

    it("shows the created insurance contract", () => {
      if (createdId === undefined) return;

      const output = cli("--output", "json", "insurance", "show", createdId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      InsuranceContractSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", createdId);
    });

    it("updates the created insurance contract", () => {
      if (createdId === undefined) return;

      const output = cli(
        "--output",
        "json",
        "insurance",
        "update",
        createdId,
        "--provider-name",
        "Updated E2E Provider",
      );
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdId);
      expect(parsed).toHaveProperty("provider_name", "Updated E2E Provider");
    });
  });
});
