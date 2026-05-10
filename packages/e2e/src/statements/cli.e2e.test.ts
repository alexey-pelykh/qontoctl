// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, cli, cliJson } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

function listStatements(): Record<string, unknown>[] {
  return cliJson<Record<string, unknown>[]>("statement", "list", "--no-paginate");
}

describe.skipIf(!hasApiKeyCredentials())("statement CLI commands (e2e)", () => {
  // -- statement list --

  describe("statement list", () => {
    it("lists statements with expected fields", () => {
      const rows = listStatements();
      expect(Array.isArray(rows)).toBe(true);

      // Sandbox may have no statements — verify structure only when data exists
      if (rows.length === 0) return;

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
      if (allRows.length === 0) return;

      const bankAccountId = (allRows[0] as Record<string, unknown>)["bank_account_id"] as string;

      const filteredRows = cliJson<Record<string, unknown>[]>(
        "statement",
        "list",
        "--bank-account",
        bankAccountId,
        "--no-paginate",
      );

      for (const row of filteredRows) {
        expect(row["bank_account_id"]).toBe(bankAccountId);
      }
    });

    it("filters by period range", () => {
      // The command should succeed; results may be empty if no statements in range
      const rows = cliJson<unknown[]>("statement", "list", "--from", "01-2025", "--to", "12-2025", "--no-paginate");
      expect(Array.isArray(rows)).toBe(true);
    });
  });

  // -- statement show --

  describe("statement show", () => {
    it("shows full details of a statement", () => {
      const allRows = listStatements();
      if (allRows.length === 0) return;

      const statementId = (allRows[0] as Record<string, unknown>)["id"] as string;

      const showRows = cliJson<Record<string, unknown>[]>("statement", "show", statementId);
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
      if (allRows.length === 0) return;

      const firstRow = allRows[0] as Record<string, unknown>;
      const statementId = firstRow["id"] as string;
      const expectedFileName = firstRow["file_name"] as string;

      const downloadDir = mkdtempSync(join(tempDir, "cwd-"));
      // Inline execFileSync here because the test exercises the CLI's
      // current-working-directory behavior (downloads to cwd when no
      // --output-dir is given). The shared `cli()` helper does not expose
      // a `cwd` option, and adding one is out of scope for this refactor.
      execFileSync("node", [CLI_PATH, "statement", "download", statementId], {
        encoding: "utf-8",
        env: cliEnv(),
        stdio: "pipe",
        cwd: downloadDir,
      });

      const downloadedFile = join(downloadDir, expectedFileName);
      expect(existsSync(downloadedFile)).toBe(true);
    });

    it("downloads a statement PDF to a specified output directory", () => {
      const allRows = listStatements();
      if (allRows.length === 0) return;

      const firstRow = allRows[0] as Record<string, unknown>;
      const statementId = firstRow["id"] as string;
      const expectedFileName = firstRow["file_name"] as string;

      const outputDir = mkdtempSync(join(tempDir, "outdir-"));
      cli("statement", "download", statementId, "--output-dir", outputDir);

      const downloadedFile = join(outputDir, expectedFileName);
      expect(existsSync(downloadedFile)).toBe(true);

      // Verify it's the only file in the directory
      const files = readdirSync(outputDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe(expectedFileName);
    });
  });
});
