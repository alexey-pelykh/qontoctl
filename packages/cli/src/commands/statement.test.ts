// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import type { Statement } from "@qontoctl/core";
import { registerStatementCommands } from "./statement.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

const { createClient } = await import("../client.js");
const createClientMock = vi.mocked(createClient);

const { writeFile } = await import("node:fs/promises");
const writeFileMock = vi.mocked(writeFile);

function makeStatement(overrides: Partial<Statement> = {}): Statement {
  return {
    id: "stmt-1",
    bank_account_id: "acct-1",
    period: "01-2025",
    file: {
      file_name: "statement-01-2025.pdf",
      file_content_type: "application/pdf",
      file_size: "16966",
      file_url: "https://example.com/download/stmt-1.pdf",
    },
    ...overrides,
  };
}

function makePaginationMeta() {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 1,
    per_page: 100,
  };
}

describe("statement commands", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const mockClient = {
      get: fetchSpy,
    };
    createClientMock.mockResolvedValue(mockClient as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("statement list", () => {
    it("lists statements with default options", async () => {
      const statements = [makeStatement()];
      fetchSpy.mockResolvedValue({
        statements,
        meta: makePaginationMeta(),
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      program.option("--no-paginate", "");
      registerStatementCommands(program);

      await program.parseAsync(["statement", "list", "--no-paginate", "-o", "json"], { from: "user" });

      expect(fetchSpy).toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalled();
      const output = (stdoutSpy.mock.calls[0] as [string])[0];
      expect(output).toContain("stmt-1");
      expect(output).toContain("01-2025");
    });

    it("passes bank-account filter parameter", async () => {
      fetchSpy.mockResolvedValue({
        statements: [],
        meta: makePaginationMeta(),
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      program.option("--no-paginate", "");
      registerStatementCommands(program);

      await program.parseAsync(["statement", "list", "--bank-account", "acct-123", "--no-paginate", "-o", "json"], {
        from: "user",
      });

      const callArgs = fetchSpy.mock.calls[0] as [string, Record<string, string>];
      expect(callArgs[0]).toBe("/v2/statements");
    });

    it("passes period filter parameters", async () => {
      fetchSpy.mockResolvedValue({
        statements: [],
        meta: makePaginationMeta(),
      });

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      program.option("--no-paginate", "");
      registerStatementCommands(program);

      await program.parseAsync(
        ["statement", "list", "--from", "01-2025", "--to", "06-2025", "--no-paginate", "-o", "json"],
        { from: "user" },
      );

      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  describe("statement show", () => {
    it("shows a single statement", async () => {
      const stmt = makeStatement();
      fetchSpy.mockResolvedValue({ statement: stmt });

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      registerStatementCommands(program);

      await program.parseAsync(["statement", "show", "stmt-1", "-o", "json"], {
        from: "user",
      });

      expect(fetchSpy).toHaveBeenCalledWith("/v2/statements/stmt-1");
      expect(stdoutSpy).toHaveBeenCalled();
      const output = (stdoutSpy.mock.calls[0] as [string])[0];
      expect(output).toContain("stmt-1");
    });

    it("encodes the statement ID in the URL", async () => {
      const stmt = makeStatement({ id: "id/with/slashes" });
      fetchSpy.mockResolvedValue({ statement: stmt });

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      registerStatementCommands(program);

      await program.parseAsync(["statement", "show", "id/with/slashes", "-o", "json"], { from: "user" });

      expect(fetchSpy).toHaveBeenCalledWith("/v2/statements/id%2Fwith%2Fslashes");
    });
  });

  describe("statement download", () => {
    it("downloads a statement PDF and writes to disk", async () => {
      const stmt = makeStatement();

      const mockClient = {
        get: vi.fn().mockResolvedValue({ statement: stmt }),
      };
      createClientMock.mockResolvedValue(mockClient as never);

      const globalFetchSpy = vi.fn().mockResolvedValue(
        new Response(Buffer.from("PDF content"), {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
      );
      vi.stubGlobal("fetch", globalFetchSpy);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerStatementCommands(program);

      await program.parseAsync(["statement", "download", "stmt-1"], {
        from: "user",
      });

      expect(mockClient.get).toHaveBeenCalledWith("/v2/statements/stmt-1");
      expect(globalFetchSpy).toHaveBeenCalledWith(stmt.file.file_url);
      expect(writeFileMock).toHaveBeenCalledWith("statement-01-2025.pdf", expect.any(Buffer));
    });

    it("strips path traversal from file name", async () => {
      const stmt = makeStatement({
        file: {
          file_name: "../../etc/malicious.pdf",
          file_content_type: "application/pdf",
          file_size: "100",
          file_url: "https://example.com/download/malicious.pdf",
        },
      });

      const mockClient = {
        get: vi.fn().mockResolvedValue({ statement: stmt }),
      };
      createClientMock.mockResolvedValue(mockClient as never);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(Buffer.from("PDF"), {
            status: 200,
          }),
        ),
      );

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerStatementCommands(program);

      await program.parseAsync(["statement", "download", "stmt-1"], {
        from: "user",
      });

      // basename("../../etc/malicious.pdf") -> "malicious.pdf"
      expect(writeFileMock).toHaveBeenCalledWith("malicious.pdf", expect.any(Buffer));
    });
  });
});
