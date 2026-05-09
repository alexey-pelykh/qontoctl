// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { InsuranceContractSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliEnv, hasOAuthCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    timeout: 30_000,
  });
}

describe.skipIf(!hasOAuthCredentials())("insurance CLI commands (e2e)", () => {
  describe("insurance CRUD lifecycle", () => {
    let createdId: string | undefined;

    it("creates an insurance contract", () => {
      const output = cli(
        "--output",
        "json",
        "insurance",
        "create",
        "--name",
        "E2E ProLiability Plan",
        "--contract-id",
        `e2e-cli-${Date.now()}`,
        "--origin",
        "qonto_other",
        "--provider-slug",
        "axa",
        "--type",
        "professional_liability",
        "--status",
        "active",
        "--payment-frequency",
        "annual",
        "--price-value",
        "99.99",
        "--price-currency",
        "EUR",
        "--start-date",
        "2026-01-01",
      );
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("type", "professional_liability");
      expect(parsed).toHaveProperty("provider_slug", "axa");
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

      const output = cli("--output", "json", "insurance", "update", createdId, "--provider-slug", "allianz");
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdId);
      expect(parsed).toHaveProperty("provider_slug", "allianz");
    });
  });
});
