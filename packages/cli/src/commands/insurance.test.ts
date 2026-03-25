// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { jsonResponse } from "@qontoctl/core/testing";
import { HttpClient } from "@qontoctl/core";
import { registerInsuranceCommands } from "./insurance.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";

const sampleContract = {
  id: "ic-123",
  insurance_type: "professional_liability",
  status: "active",
  provider_name: "AXA",
  contract_number: "CNT-12345",
  start_date: "2026-01-01",
  end_date: "2027-01-01",
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

const sampleDocument = {
  id: "doc-123",
  file_name: "policy.pdf",
  file_size: "54321",
  file_content_type: "application/pdf",
  url: "https://example.com/documents/doc-123",
  created_at: "2026-01-01T10:00:00Z",
};

describe("insurance commands", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers an insurance command group", () => {
    const program = new Command();
    registerInsuranceCommands(program);

    const insuranceCommand = program.commands.find((c) => c.name() === "insurance");
    expect(insuranceCommand).toBeDefined();
  });

  describe("insurance show", () => {
    it("shows contract details in table format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["insurance", "show", "ic-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("ic-123");
      expect(output).toContain("AXA");
    });

    it("shows contract details in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "insurance", "show", "ic-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "ic-123");
      expect(parsed).toHaveProperty("insurance_type", "professional_liability");
      expect(parsed).toHaveProperty("provider_name", "AXA");
    });

    it("sends GET to the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["insurance", "show", "ic-123"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-123");
      expect(opts.method).toBe("GET");
    });
  });

  describe("insurance create", () => {
    it("creates a contract in table format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "insurance",
          "create",
          "--insurance-type",
          "professional_liability",
          "--provider-name",
          "AXA",
          "--start-date",
          "2026-01-01",
        ],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("ic-123");
      expect(output).toContain("AXA");
    });

    it("sends POST with correct body", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "insurance",
          "create",
          "--insurance-type",
          "professional_liability",
          "--provider-name",
          "AXA",
          "--start-date",
          "2026-01-01",
          "--contract-number",
          "CNT-12345",
        ],
        { from: "user" },
      );

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts");
      expect(opts.method).toBe("POST");

      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        insurance_contract: {
          insurance_type: "professional_liability",
          provider_name: "AXA",
          start_date: "2026-01-01",
          contract_number: "CNT-12345",
        },
      });
    });
  });

  describe("insurance update", () => {
    it("updates a contract", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["insurance", "update", "ic-123", "--provider-name", "Allianz"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-123");
      expect(opts.method).toBe("PUT");

      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({ insurance_contract: { provider_name: "Allianz" } });
    });
  });

  describe("insurance upload-doc", () => {
    it("uploads a document via multipart form-data", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_document: sampleDocument }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["insurance", "upload-doc", "ic-123", "package.json"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("doc-123");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-123/documents");
      expect(opts.method).toBe("POST");
      expect(opts.body).toBeInstanceOf(FormData);
    });
  });

  describe("insurance remove-doc", () => {
    it("requires --yes confirmation", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["insurance", "remove-doc", "ic-123", "doc-123"], { from: "user" });

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Use --yes to confirm");
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });

    it("removes a document when --yes is provided", async () => {
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["insurance", "remove-doc", "ic-123", "doc-123", "--yes"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Document doc-123 removed");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-123/documents/doc-123");
      expect(opts.method).toBe("DELETE");
    });
  });
});
