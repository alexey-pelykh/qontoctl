// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(),
  isCancel: vi.fn(),
}));

import { confirm, isCancel } from "@clack/prompts";
import { createClient } from "../../client.js";
import { HttpClient } from "@qontoctl/core";

const sampleAttachment = {
  id: "att-123",
  file_name: "receipt.png",
  file_size: "5678",
  file_content_type: "image/png",
  url: "https://example.com/attachments/att-123",
  created_at: "2026-03-01T10:00:00Z",
};

describe("transaction attachment commands", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("transaction attachment list", () => {
    it("lists attachments for a transaction in table format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ attachments: [sampleAttachment] }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["transaction", "attachment", "list", "tx-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("att-123");
      expect(output).toContain("receipt.png");
    });

    it("lists attachments in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ attachments: [sampleAttachment] }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "transaction", "attachment", "list", "tx-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toHaveProperty("id", "att-123");
    });

    it("sends GET to the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ attachments: [sampleAttachment] }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["transaction", "attachment", "list", "tx-1"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/transactions/tx-1/attachments");
      expect(opts.method).toBe("GET");
    });
  });

  describe("transaction attachment add", () => {
    it("attaches a file to a transaction via multipart form-data", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ attachment: sampleAttachment }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["transaction", "attachment", "add", "tx-1", "package.json"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("att-123");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/transactions/tx-1/attachments");
      expect(opts.method).toBe("POST");
      expect(opts.body).toBeInstanceOf(FormData);
    });

    it("prints success to stderr when API returns no attachment data", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({}));
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["transaction", "attachment", "add", "tx-1", "package.json"], { from: "user" });

      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalledWith("Attachment package.json added to transaction tx-1.\n");
      stderrSpy.mockRestore();
    });
  });

  describe("transaction attachment remove (specific)", () => {
    it("removes a specific attachment from a transaction", async () => {
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["transaction", "attachment", "remove", "tx-1", "att-123"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/transactions/tx-1/attachments/att-123");
      expect(opts.method).toBe("DELETE");

      expect(stderrSpy).toHaveBeenCalledWith("Attachment att-123 removed from transaction tx-1.\n");
      stderrSpy.mockRestore();
    });
  });

  describe("transaction attachment remove (all)", () => {
    it("removes all attachments when user confirms", async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      vi.mocked(isCancel).mockReturnValue(false);
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["transaction", "attachment", "remove", "tx-1"], { from: "user" });

      expect(confirm).toHaveBeenCalledWith({
        message: "Remove ALL attachments from transaction tx-1?",
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/transactions/tx-1/attachments");
      expect(opts.method).toBe("DELETE");

      expect(stderrSpy).toHaveBeenCalledWith("All attachments removed from transaction tx-1.\n");
      stderrSpy.mockRestore();
    });

    it("aborts when user declines confirmation", async () => {
      vi.mocked(confirm).mockResolvedValue(false);
      vi.mocked(isCancel).mockReturnValue(false);
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["transaction", "attachment", "remove", "tx-1"], { from: "user" });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalledWith("Aborted.\n");
      stderrSpy.mockRestore();
    });

    it("aborts when user cancels with Ctrl+C", async () => {
      const cancelSymbol = Symbol("cancel");
      vi.mocked(confirm).mockResolvedValue(cancelSymbol as unknown as boolean);
      vi.mocked(isCancel).mockReturnValue(true);
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["transaction", "attachment", "remove", "tx-1"], { from: "user" });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalledWith("Aborted.\n");
      stderrSpy.mockRestore();
    });
  });
});
