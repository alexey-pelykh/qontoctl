// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command, Option } from "commander";
import { jsonResponse } from "@qontoctl/core/testing";
import { createAttachmentCommand } from "./attachment.js";
import { OUTPUT_FORMATS } from "../options.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

const sampleAttachment = {
  id: "att-123",
  file_name: "invoice.pdf",
  file_size: "12345",
  file_content_type: "application/pdf",
  url: "https://example.com/attachments/att-123",
  created_at: "2026-03-01T10:00:00Z",
};

/**
 * Create a lightweight test program with only the global options and attachment
 * commands registered.  This avoids the expensive dynamic import of the
 * full program module (which loads every command module) that can exceed
 * the per-test timeout on slower CI runners (e.g. Windows).
 */
function createTestProgram(): Command {
  const program = new Command();
  program
    .addOption(new Option("-o, --output <format>", "output format").choices([...OUTPUT_FORMATS]).default("table"))
    .addOption(new Option("--no-paginate", "disable auto-pagination"));
  program.addCommand(createAttachmentCommand());
  program.exitOverride();
  return program;
}

describe("attachment commands", () => {
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

  describe("attachment show", () => {
    it("shows attachment details in table format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ attachment: sampleAttachment }));

      const program = createTestProgram();

      await program.parseAsync(["attachment", "show", "att-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("att-123");
      expect(output).toContain("invoice.pdf");
    });

    it("shows attachment details in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ attachment: sampleAttachment }));

      const program = createTestProgram();

      await program.parseAsync(["--output", "json", "attachment", "show", "att-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "att-123");
      expect(parsed).toHaveProperty("file_name", "invoice.pdf");
      expect(parsed).toHaveProperty("file_size", "12345");
      expect(parsed).toHaveProperty("file_content_type", "application/pdf");
    });

    it("sends GET to the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ attachment: sampleAttachment }));

      const program = createTestProgram();

      await program.parseAsync(["attachment", "show", "att-123"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/attachments/att-123");
      expect(opts.method).toBe("GET");
    });
  });

  describe("attachment upload", () => {
    it("uploads a file via multipart form-data", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ attachment: sampleAttachment }));

      const program = createTestProgram();

      // Use a real file that exists in the repo
      await program.parseAsync(["attachment", "upload", "package.json"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("att-123");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/attachments");
      expect(opts.method).toBe("POST");
      expect(opts.body).toBeInstanceOf(FormData);
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ attachment: sampleAttachment }));

      const program = createTestProgram();

      await program.parseAsync(["attachment", "upload", "package.json", "--idempotency-key", "key-abc"], {
        from: "user",
      });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-abc");
    });
  });
});
