// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(
  import.meta.dirname,
  "../../../qontoctl/dist/cli.js",
);

function cli(args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
  });
}

describe.skipIf(!hasCredentials())(
  "organization & accounts CLI (e2e)",
  () => {
    let knownAccountId: string;

    beforeAll(() => {
      // Discover an account ID from the sandbox for use in `account show`
      const json = cli(["account", "list", "--output", "json"]);
      const accounts = JSON.parse(json) as { id: string }[];
      expect(accounts.length).toBeGreaterThan(0);
      knownAccountId = (accounts[0] as { id: string }).id;
    });

    // ── org show ────────────────────────────────────────────────────

    it("org show displays organization details in table format", () => {
      const output = cli(["org", "show"]);
      expect(output).toContain("slug");
      expect(output).toContain("legal_name");
      expect(output).toContain("bank_accounts");
    });

    it("org show --output json produces valid JSON with expected fields", () => {
      const output = cli(["org", "show", "--output", "json"]);
      const org = JSON.parse(output) as Record<string, unknown>;
      expect(org).toHaveProperty("slug");
      expect(org).toHaveProperty("legal_name");
      expect(org).toHaveProperty("bank_accounts");
      expect(typeof org["slug"]).toBe("string");
      expect(typeof org["legal_name"]).toBe("string");
      expect(Array.isArray(org["bank_accounts"])).toBe(true);
    });

    // ── account list ───────────────────────────────────────────────

    it("account list displays accounts in table format", () => {
      const output = cli(["account", "list"]);
      expect(output).toContain("id");
      expect(output).toContain("name");
      expect(output).toContain("iban");
      expect(output).toContain("balance");
      expect(output).toContain("status");
    });

    it("account list --output json produces valid JSON array", () => {
      const output = cli(["account", "list", "--output", "json"]);
      const accounts = JSON.parse(output) as Record<string, unknown>[];
      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBeGreaterThan(0);

      const account = accounts[0] as Record<string, unknown>;
      expect(account).toHaveProperty("id");
      expect(account).toHaveProperty("name");
      expect(account).toHaveProperty("iban");
      expect(account).toHaveProperty("balance");
      expect(account).toHaveProperty("currency");
      expect(account).toHaveProperty("status");
    });

    // ── account show ───────────────────────────────────────────────

    it("account show displays account details in table format", () => {
      const output = cli(["account", "show", knownAccountId]);
      expect(output).toContain(knownAccountId);
      expect(output).toContain("iban");
      expect(output).toContain("balance");
      expect(output).toContain("status");
    });

    it("account show --output json produces valid JSON object", () => {
      const output = cli([
        "account",
        "show",
        knownAccountId,
        "--output",
        "json",
      ]);
      const account = JSON.parse(output) as Record<string, unknown>;
      expect(account).toHaveProperty("id", knownAccountId);
      expect(account).toHaveProperty("name");
      expect(account).toHaveProperty("iban");
      expect(account).toHaveProperty("bic");
      expect(account).toHaveProperty("balance");
      expect(account).toHaveProperty("authorized_balance");
      expect(account).toHaveProperty("currency");
      expect(account).toHaveProperty("status");
    });
  },
);
