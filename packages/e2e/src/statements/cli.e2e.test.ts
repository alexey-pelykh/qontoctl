// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

const hasSandboxCreds =
  process.env["QONTOCTL_ORGANIZATION_SLUG"] !== undefined &&
  process.env["QONTOCTL_SECRET_KEY"] !== undefined;

/**
 * Build environment with sandbox credentials for CLI invocations.
 * Inherits the current process environment and ensures sandbox mode is on.
 */
function sandboxEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    QONTOCTL_SANDBOX: "true",
  };
}

function listStatements(): Record<string, unknown>[] {
  const output = execFileSync(
    "node",
    [CLI_PATH, "statement", "list", "--no-paginate", "-o", "json"],
    { encoding: "utf-8", env: sandboxEnv() },
  );
  return JSON.parse(output) as Record<string, unknown>[];
}

describe.skipIf(!hasSandboxCreds)("statement CLI commands (e2e)", () => {
  // -- statement list --

  describe("statement list", () => {
    it("lists statements with expected fields", () => {
      const rows = listStatements();
      expect(rows.length).toBeGreaterThan(0);

      const first = rows[0] as Record<string, unknown>;
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("bank_account_id");
      expect(first).toHaveProperty("period");
      expect(first).toHaveProperty("file_name");
      expect(first).toHaveProperty("file_content_type");
      expect(first).toHaveProperty("file_size");
    });

    it("filters by bank account ID", () => {
      const allRows = listStatements();
      expect(allRows.length).toBeGreaterThan(0);

      const bankAccountId = (allRows[0] as Record<string, unknown>)["bank_account_id"] as string;

      const filteredOutput = execFileSync(
        "node",
        [
          CLI_PATH,
          "statement",
          "list",
          "--bank-account",
          bankAccountId,
          "--no-paginate",
          "-o",
          "json",
        ],
        { encoding: "utf-8", env: sandboxEnv() },
      );
      const filteredRows = JSON.parse(filteredOutput) as Record<string, unknown>[];

      for (const row of filteredRows) {
        expect(row["bank_account_id"]).toBe(bankAccountId);
      }
    });

    it("filters by period range", () => {
      const output = execFileSync(
        "node",
        [
          CLI_PATH,
          "statement",
          "list",
          "--from",
          "01-2025",
          "--to",
          "12-2025",
          "--no-paginate",
          "-o",
          "json",
        ],
        { encoding: "utf-8", env: sandboxEnv() },
      );

      // The command should succeed; results may be empty if no statements in range
      const rows = JSON.parse(output) as unknown[];
      expect(Array.isArray(rows)).toBe(true);
    });
  });

  // -- statement show --

  describe("statement show", () => {
    it("shows full details of a statement", () => {
      const allRows = listStatements();
      expect(allRows.length).toBeGreaterThan(0);

      const statementId = (allRows[0] as Record<string, unknown>)["id"] as string;

      const showOutput = execFileSync(
        "node",
        [CLI_PATH, "statement", "show", statementId, "-o", "json"],
        { encoding: "utf-8", env: sandboxEnv() },
      );
      const showRows = JSON.parse(showOutput) as Record<string, unknown>[];
      expect(showRows).toHaveLength(1);

      const row = showRows[0] as Record<string, unknown>;
      expect(row["id"]).toBe(statementId);
      expect(row).toHaveProperty("bank_account_id");
      expect(row).toHaveProperty("period");
      expect(row).toHaveProperty("file_name");
      expect(row).toHaveProperty("file_content_type");
      expect(row).toHaveProperty("file_size");
    });
  });

  // -- statement download --

  describe("statement download", () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = mkdtempSync(join(tmpdir(), "qontoctl-stmt-download-e2e-"));
    });

    afterAll(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("downloads a statement PDF to the current directory", () => {
      const allRows = listStatements();
      expect(allRows.length).toBeGreaterThan(0);

      const firstRow = allRows[0] as Record<string, unknown>;
      const statementId = firstRow["id"] as string;
      const expectedFileName = firstRow["file_name"] as string;

      const downloadDir = mkdtempSync(join(tempDir, "cwd-"));
      execFileSync(
        "node",
        [CLI_PATH, "statement", "download", statementId],
        { encoding: "utf-8", env: sandboxEnv(), cwd: downloadDir },
      );

      const downloadedFile = join(downloadDir, expectedFileName);
      expect(existsSync(downloadedFile)).toBe(true);
    });

    it("downloads a statement PDF to a specified output directory", () => {
      const allRows = listStatements();
      expect(allRows.length).toBeGreaterThan(0);

      const firstRow = allRows[0] as Record<string, unknown>;
      const statementId = firstRow["id"] as string;
      const expectedFileName = firstRow["file_name"] as string;

      const outputDir = mkdtempSync(join(tempDir, "outdir-"));
      execFileSync(
        "node",
        [CLI_PATH, "statement", "download", statementId, "--output-dir", outputDir],
        { encoding: "utf-8", env: sandboxEnv() },
      );

      const downloadedFile = join(outputDir, expectedFileName);
      expect(existsSync(downloadedFile)).toBe(true);

      // Verify it's the only file in the directory
      const files = readdirSync(outputDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe(expectedFileName);
    });
  });
});
