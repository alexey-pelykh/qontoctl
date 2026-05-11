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
  name: "ProLiability Plan 2026",
  contract_id: "CNT-12345",
  origin: "qonto_other",
  provider_slug: "axa",
  type: "business_liability",
  status: "active",
  payment_frequency: "annual",
  price: { value: "99.99", currency: "EUR" },
  start_date: "2026-01-01",
  expiration_date: "2027-01-01",
};

const sampleDocument = {
  id: "doc-123",
  name: "policy.pdf",
  type: "contract",
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
      expect(output).toContain("axa");
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
      expect(parsed).toHaveProperty("type", "business_liability");
      expect(parsed).toHaveProperty("provider_slug", "axa");
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
    const createArgs = [
      "insurance",
      "create",
      "--name",
      "ProLiability Plan 2026",
      "--contract-id",
      "CNT-12345",
      "--origin",
      "qonto_other",
      "--provider-slug",
      "axa",
      "--type",
      "business_liability",
      "--status",
      "active",
      "--payment-frequency",
      "annual",
      "--price-value",
      "99.99",
      "--price-currency",
      "EUR",
    ];

    it("creates a contract in table format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(createArgs, { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("ic-123");
      expect(output).toContain("axa");
    });

    it("sends POST with correct body (mandatory fields only)", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(createArgs, { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts");
      expect(opts.method).toBe("POST");

      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        insurance_contract: {
          name: "ProLiability Plan 2026",
          contract_id: "CNT-12345",
          origin: "qonto_other",
          provider_slug: "axa",
          type: "business_liability",
          status: "active",
          payment_frequency: "annual",
          price: { value: "99.99", currency: "EUR" },
        },
      });
    });

    it("sends POST with all optional fields when provided", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          ...createArgs,
          "--start-date",
          "2026-01-01",
          "--expiration-date",
          "2027-01-01",
          "--renewal-date",
          "2026-12-15",
          "--service-url",
          "https://service.example.com",
          "--troubleshooting-url",
          "https://help.example.com",
        ],
        { from: "user" },
      );

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(opts.body as string) as { insurance_contract: Record<string, unknown> };
      expect(body.insurance_contract).toMatchObject({
        start_date: "2026-01-01",
        expiration_date: "2027-01-01",
        renewal_date: "2026-12-15",
        service_url: "https://service.example.com",
        troubleshooting_url: "https://help.example.com",
      });
    });

    it("rejects unknown origin values", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      const argsWithBadOrigin = createArgs.map((arg, idx) => {
        return idx > 0 && createArgs[idx - 1] === "--origin" ? "made_up" : arg;
      });

      await expect(program.parseAsync(argsWithBadOrigin, { from: "user" })).rejects.toThrow();
    });
  });

  describe("insurance update", () => {
    it("updates a contract", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["insurance", "update", "ic-123", "--provider-slug", "allianz"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-123");
      expect(opts.method).toBe("PATCH");

      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({ insurance_contract: { provider_slug: "allianz" } });
    });

    it("sends a price object when both --price-value and --price-currency are provided", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ insurance_contract: sampleContract }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        ["insurance", "update", "ic-123", "--price-value", "120.00", "--price-currency", "EUR"],
        { from: "user" },
      );

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(opts.body as string) as { insurance_contract: Record<string, unknown> };
      expect(body.insurance_contract).toEqual({ price: { value: "120.00", currency: "EUR" } });
    });

    it("rejects partial --price-value without --price-currency", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await expect(
        program.parseAsync(["insurance", "update", "ic-123", "--price-value", "120.00"], { from: "user" }),
      ).rejects.toThrow(/--price-value and --price-currency must be provided together/);
    });
  });

  describe("insurance upload-doc", () => {
    it("uploads a document via multipart form-data with required --type", async () => {
      fetchSpy.mockImplementation(() => jsonResponse(sampleDocument));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["insurance", "upload-doc", "ic-123", "package.json", "--type", "contract"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("doc-123");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-123/attachments");
      expect(opts.method).toBe("POST");
      expect(opts.body).toBeInstanceOf(FormData);
      const fd = opts.body as FormData;
      expect(fd.get("name")).toBe("package.json");
      expect(fd.get("type")).toBe("contract");
    });

    it("rejects upload-doc without --type", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await expect(
        program.parseAsync(["insurance", "upload-doc", "ic-123", "package.json"], { from: "user" }),
      ).rejects.toThrow();
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
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-123/attachments/doc-123");
      expect(opts.method).toBe("DELETE");
    });
  });
});
