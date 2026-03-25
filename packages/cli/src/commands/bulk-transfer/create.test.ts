// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { HttpClient } from "@qontoctl/core";
import { registerBulkTransferCommands } from "./index.js";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn((_client: unknown, operation: (scaSessionToken?: string) => Promise<unknown>) =>
    operation(undefined),
  ),
}));

import { createClient } from "../../client.js";
import { readFile } from "node:fs/promises";

const sampleBulkTransfer = {
  id: "bt-001",
  initiator_id: "user-1",
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
  total_count: 2,
  completed_count: 0,
  pending_count: 2,
  failed_count: 0,
  results: [
    {
      client_transfer_id: "ct-1",
      transfer_id: "txfr-1",
      status: "pending",
      errors: null,
    },
    {
      client_transfer_id: "ct-2",
      transfer_id: "txfr-2",
      status: "pending",
      errors: null,
    },
  ],
};

const transfersJson = JSON.stringify([
  { beneficiary_id: "ben-1", amount: 100, currency: "EUR", reference: "Pay 1" },
  { beneficiary_id: "ben-2", amount: 200, currency: "EUR", reference: "Pay 2" },
]);

describe("bulk-transfer create command", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    vi.mocked(readFile).mockResolvedValue(transfersJson);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the JSON file and creates a bulk transfer in table format", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ bulk_transfer: sampleBulkTransfer }));

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerBulkTransferCommands(program);

    await program.parseAsync(["bulk-transfer", "create", "--file", "/tmp/transfers.json"], { from: "user" });

    expect(readFile).toHaveBeenCalledWith("/tmp/transfers.json", "utf-8");
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("bt-001");
  });

  it("outputs json format", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ bulk_transfer: sampleBulkTransfer }));

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerBulkTransferCommands(program);

    await program.parseAsync(["bulk-transfer", "create", "--file", "/tmp/transfers.json"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleBulkTransfer;
    expect(parsed.id).toBe("bt-001");
    expect(parsed.total_count).toBe(2);
  });

  it("sends POST to the correct endpoint with parsed transfers", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ bulk_transfer: sampleBulkTransfer }));

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerBulkTransferCommands(program);

    await program.parseAsync(["bulk-transfer", "create", "--file", "/tmp/transfers.json"], { from: "user" });

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/bulk_transfers");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string) as { bulk_transfer: { transfers: unknown[] } };
    expect(body.bulk_transfer.transfers).toHaveLength(2);
    expect(body.bulk_transfer.transfers[0]).toEqual({
      beneficiary_id: "ben-1",
      amount: 100,
      currency: "EUR",
      reference: "Pay 1",
    });
  });

  it("passes idempotency key header when provided", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ bulk_transfer: sampleBulkTransfer }));

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerBulkTransferCommands(program);

    await program.parseAsync(
      ["bulk-transfer", "create", "--file", "/tmp/transfers.json", "--idempotency-key", "idem-key-42"],
      { from: "user" },
    );

    const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers["X-Qonto-Idempotency-Key"]).toBe("idem-key-42");
  });

  it("invokes SCA wrapper around the API call", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ bulk_transfer: sampleBulkTransfer }));
    const { executeWithCliSca } = await import("../../sca.js");

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerBulkTransferCommands(program);

    await program.parseAsync(["bulk-transfer", "create", "--file", "/tmp/transfers.json"], { from: "user" });

    expect(executeWithCliSca).toHaveBeenCalledWith(expect.anything(), expect.any(Function), expect.anything());
  });
});
