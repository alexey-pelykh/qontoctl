// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createClientCommand } from "./client.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

const sampleClient = {
  id: "cl-123",
  name: "Acme Corp",
  first_name: null,
  last_name: null,
  kind: "company",
  email: "contact@acme.com",
  address: "123 Main St",
  city: "Paris",
  zip_code: "75001",
  province_code: null,
  country_code: "FR",
  billing_address: null,
  delivery_address: null,
  vat_number: "FR12345678901",
  tax_identification_number: null,
  locale: "fr",
  currency: "EUR",
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
};

describe("client commands", () => {
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

  describe("client list", () => {
    it("lists clients in table format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          clients: [sampleClient],
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 1,
            per_page: 100,
          },
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["client", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("cl-123");
      expect(output).toContain("Acme Corp");
    });

    it("lists clients in json format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          clients: [sampleClient],
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 1,
            per_page: 100,
          },
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      const first = parsed[0] as Record<string, unknown>;
      expect(first).toHaveProperty("id", "cl-123");
      expect(first).toHaveProperty("name", "Acme Corp");
      expect(first).toHaveProperty("kind", "company");
    });
  });

  describe("client show", () => {
    it("shows client details in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ client: sampleClient }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client", "show", "cl-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "cl-123");
      expect(parsed).toHaveProperty("name", "Acme Corp");
      expect(parsed).toHaveProperty("email", "contact@acme.com");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ client: sampleClient }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["client", "show", "cl-123"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/clients/cl-123");
    });
  });

  describe("client create", () => {
    it("creates a company client in table format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ client: sampleClient }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["client", "create", "--kind", "company", "--name", "Acme Corp"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("cl-123");
      expect(output).toContain("Acme Corp");
    });

    it("creates a client in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ client: sampleClient }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client", "create", "--kind", "company", "--name", "Acme Corp"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "cl-123");
      expect(parsed).toHaveProperty("name", "Acme Corp");
    });

    it("sends POST with flat body to the correct endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ client: sampleClient }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(
        ["client", "create", "--kind", "company", "--name", "Acme Corp", "--email", "contact@acme.com"],
        { from: "user" },
      );

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/clients");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        kind: "company",
        name: "Acme Corp",
        email: "contact@acme.com",
      });
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ client: sampleClient }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(
        ["client", "create", "--kind", "company", "--name", "Acme Corp", "--idempotency-key", "key-abc-123"],
        { from: "user" },
      );

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-abc-123");
    });
  });

  describe("client update", () => {
    it("updates a client in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ client: { ...sampleClient, name: "Acme Inc" } }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client", "update", "cl-123", "--name", "Acme Inc"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "cl-123");
      expect(parsed).toHaveProperty("name", "Acme Inc");
    });

    it("sends PATCH with flat body to the correct endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ client: sampleClient }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["client", "update", "cl-123", "--name", "Acme Inc", "--email", "new@acme.com"], {
        from: "user",
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/clients/cl-123");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        name: "Acme Inc",
        email: "new@acme.com",
      });
    });
  });

  describe("client delete", () => {
    it("deletes a client with --yes flag", async () => {
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client", "delete", "cl-123", "--yes"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
      expect(parsed).toHaveProperty("id", "cl-123");
    });

    it("sends DELETE to the correct endpoint", async () => {
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["client", "delete", "cl-123", "--yes"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/clients/cl-123");
      expect(opts.method).toBe("DELETE");
    });

    it("exits with error when --yes is not provided", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientCommand());
      program.exitOverride();

      await program.parseAsync(["client", "delete", "cl-123"], { from: "user" });

      expect(stderrSpy).toHaveBeenCalled();
      const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
      expect(errorOutput).toContain("About to delete client cl-123");
      expect(errorOutput).toContain("--yes");
      expect(process.exitCode).toBe(1);
    });
  });
});
