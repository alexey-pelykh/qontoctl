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
  executeWithCliSca: vi.fn(
    (
      _client: unknown,
      operation: (ctx: { scaSessionToken?: string; idempotencyKey: string }) => Promise<unknown>,
      options?: { idempotencyKey?: string },
    ) => operation({ idempotencyKey: options?.idempotencyKey ?? "test-idempotency-key" }),
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

const sampleBeneficiary = (id: string, iban: string, name: string) => ({
  id,
  name,
  iban,
  bic: "DEUTDEDDXXX",
  trusted: true,
  status: "validated",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const sampleVopProof = {
  proof_token: { token: "tok_bulk_xyz" },
  requests: [
    {
      id: "0",
      beneficiary_name: "Alice Inc",
      iban: "DE91100000000123456789",
      response: { match_result: "MATCH_RESULT_MATCH", matched_name: null },
    },
    {
      id: "1",
      beneficiary_name: "Bob Inc",
      iban: "DE89370400440532013000",
      response: { match_result: "MATCH_RESULT_MATCH", matched_name: null },
    },
  ],
};

const transfersJson = JSON.stringify([
  {
    client_transfer_id: "ct-1",
    beneficiary_id: "ben-1",
    amount: 100,
    reference: "Pay 1",
  },
  {
    client_transfer_id: "ct-2",
    beneficiary_id: "ben-2",
    amount: 200,
    reference: "Pay 2",
  },
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
    vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockHappyPath(): void {
    fetchSpy.mockImplementation((url: URL) => {
      const path = url.pathname;
      if (path.startsWith("/v2/sepa/beneficiaries/ben-1")) {
        return jsonResponse({ beneficiary: sampleBeneficiary("ben-1", "DE91100000000123456789", "Alice Inc") });
      }
      if (path.startsWith("/v2/sepa/beneficiaries/ben-2")) {
        return jsonResponse({ beneficiary: sampleBeneficiary("ben-2", "DE89370400440532013000", "Bob Inc") });
      }
      if (path === "/v2/sepa/bulk_verify_payee") {
        return jsonResponse(sampleVopProof);
      }
      if (path === "/v2/sepa/bulk_transfers") {
        return jsonResponse({ bulk_transfer: sampleBulkTransfer });
      }
      throw new Error(`Unexpected URL: ${path}`);
    });
  }

  it("auto-resolves the VoP proof token via bulk_verify_payee when --vop-proof-token is omitted", async () => {
    mockHappyPath();

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerBulkTransferCommands(program);

    await program.parseAsync(
      ["bulk-transfer", "create", "--file", "/var/in/transfers.json", "--debit-account", "acct-uuid"],
      { from: "user" },
    );

    const calls = fetchSpy.mock.calls.map(([url]: [URL]) => url.pathname);
    expect(calls).toContain("/v2/sepa/beneficiaries/ben-1");
    expect(calls).toContain("/v2/sepa/beneficiaries/ben-2");
    expect(calls).toContain("/v2/sepa/bulk_verify_payee");
    expect(calls).toContain("/v2/sepa/bulk_transfers");

    const bulkVopCall = fetchSpy.mock.calls.find(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_verify_payee") as [
      URL,
      RequestInit,
    ];
    const vopBody = JSON.parse(bulkVopCall[1].body as string) as {
      requests: { id: string; iban: string; beneficiary_name: string }[];
    };
    expect(vopBody.requests).toEqual([
      { id: "0", iban: "DE91100000000123456789", beneficiary_name: "Alice Inc" },
      { id: "1", iban: "DE89370400440532013000", beneficiary_name: "Bob Inc" },
    ]);
  });

  it("sends POST /v2/sepa/bulk_transfers with the flat body shape (no wrapper, no currency)", async () => {
    mockHappyPath();

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerBulkTransferCommands(program);

    await program.parseAsync(
      ["bulk-transfer", "create", "--file", "/var/in/transfers.json", "--debit-account", "acct-uuid"],
      { from: "user" },
    );

    const createCall = fetchSpy.mock.calls.find(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_transfers") as [
      URL,
      RequestInit,
    ];
    expect(createCall[1].method).toBe("POST");
    const body = JSON.parse(createCall[1].body as string) as Record<string, unknown>;
    expect(body).toEqual({
      bank_account_id: "acct-uuid",
      vop_proof_token: "tok_bulk_xyz",
      bulk_transfers: [
        { client_transfer_id: "ct-1", beneficiary_id: "ben-1", amount: "100.00", reference: "Pay 1" },
        { client_transfer_id: "ct-2", beneficiary_id: "ben-2", amount: "200.00", reference: "Pay 2" },
      ],
    });
  });

  it("uses --vop-proof-token verbatim and skips bulk_verify_payee when supplied", async () => {
    fetchSpy.mockImplementation((url: URL) => {
      if (url.pathname === "/v2/sepa/bulk_transfers") {
        return jsonResponse({ bulk_transfer: sampleBulkTransfer });
      }
      throw new Error(`Unexpected URL: ${url.pathname}`);
    });

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerBulkTransferCommands(program);

    await program.parseAsync(
      [
        "bulk-transfer",
        "create",
        "--file",
        "/var/in/transfers.json",
        "--debit-account",
        "acct-uuid",
        "--vop-proof-token",
        "tok_user_supplied",
      ],
      { from: "user" },
    );

    const createCall = fetchSpy.mock.calls.find(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_transfers") as [
      URL,
      RequestInit,
    ];
    const body = JSON.parse(createCall[1].body as string) as { vop_proof_token: string };
    expect(body.vop_proof_token).toBe("tok_user_supplied");

    const bulkVopCalled = fetchSpy.mock.calls.some(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_verify_payee");
    expect(bulkVopCalled).toBe(false);
  });

  it("auto-generates client_transfer_id (UUID v4) for items missing it", async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify([{ beneficiary_id: "ben-1", amount: "1.00", reference: "Auto-gen test" }]),
    );
    fetchSpy.mockImplementation((url: URL) => {
      const path = url.pathname;
      if (path.startsWith("/v2/sepa/beneficiaries/ben-1")) {
        return jsonResponse({ beneficiary: sampleBeneficiary("ben-1", "DE91100000000123456789", "Alice Inc") });
      }
      if (path === "/v2/sepa/bulk_verify_payee") {
        return jsonResponse({
          proof_token: { token: "tok-x" },
          requests: [
            {
              id: "0",
              beneficiary_name: "Alice Inc",
              iban: "DE91100000000123456789",
              response: { match_result: "MATCH_RESULT_MATCH", matched_name: null },
            },
          ],
        });
      }
      if (path === "/v2/sepa/bulk_transfers") {
        return jsonResponse({ bulk_transfer: sampleBulkTransfer });
      }
      throw new Error(`Unexpected URL: ${path}`);
    });

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerBulkTransferCommands(program);

    await program.parseAsync(
      ["bulk-transfer", "create", "--file", "/var/in/transfers.json", "--debit-account", "acct-uuid"],
      { from: "user" },
    );

    const createCall = fetchSpy.mock.calls.find(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_transfers") as [
      URL,
      RequestInit,
    ];
    const body = JSON.parse(createCall[1].body as string) as {
      bulk_transfers: { client_transfer_id: string }[];
    };
    expect(body.bulk_transfers[0]?.client_transfer_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("supports inline beneficiary items (skips beneficiary fetch, sends inline data through)", async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify([
        {
          client_transfer_id: "ct-inline",
          amount: "9.99",
          reference: "Inline pay",
          beneficiary: { name: "Alice", iban: "DE91100000000123456789", bic: "DEUTDEDDXXX" },
        },
      ]),
    );
    fetchSpy.mockImplementation((url: URL) => {
      const path = url.pathname;
      if (path === "/v2/sepa/bulk_verify_payee") {
        return jsonResponse({
          proof_token: { token: "tok-inline" },
          requests: [
            {
              id: "0",
              beneficiary_name: "Alice",
              iban: "DE91100000000123456789",
              response: { match_result: "MATCH_RESULT_MATCH", matched_name: null },
            },
          ],
        });
      }
      if (path === "/v2/sepa/bulk_transfers") {
        return jsonResponse({ bulk_transfer: sampleBulkTransfer });
      }
      throw new Error(`Unexpected URL: ${path}`);
    });

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerBulkTransferCommands(program);

    await program.parseAsync(
      ["bulk-transfer", "create", "--file", "/var/in/transfers.json", "--debit-account", "acct-uuid"],
      { from: "user" },
    );

    const calls = fetchSpy.mock.calls.map(([url]: [URL]) => url.pathname);
    // No beneficiary fetch for inline-beneficiary items.
    const beneficiaryFetched = calls.some((p: string) => p.startsWith("/v2/sepa/beneficiaries/"));
    expect(beneficiaryFetched).toBe(false);

    const createCall = fetchSpy.mock.calls.find(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_transfers") as [
      URL,
      RequestInit,
    ];
    const body = JSON.parse(createCall[1].body as string) as { bulk_transfers: BulkTransferItemSubset[] };
    expect(body.bulk_transfers[0]?.beneficiary).toEqual({
      name: "Alice",
      iban: "DE91100000000123456789",
      bic: "DEUTDEDDXXX",
    });
    expect(body.bulk_transfers[0]?.beneficiary_id).toBeUndefined();
  });

  it("throws when an item specifies both beneficiary_id and beneficiary", async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify([
        {
          client_transfer_id: "ct-bad",
          amount: "1.00",
          reference: "Conflict",
          beneficiary_id: "ben-1",
          beneficiary: { name: "Alice", iban: "DE91100000000123456789" },
        },
      ]),
    );

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    program.exitOverride();
    registerBulkTransferCommands(program);

    await expect(
      program.parseAsync(
        ["bulk-transfer", "create", "--file", "/var/in/transfers.json", "--debit-account", "acct-uuid"],
        { from: "user" },
      ),
    ).rejects.toThrow(/exactly one of beneficiary_id or beneficiary/);
  });

  it("throws when an item specifies neither beneficiary_id nor beneficiary", async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify([{ amount: "1.00", reference: "no-beneficiary" }]));

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    program.exitOverride();
    registerBulkTransferCommands(program);

    await expect(
      program.parseAsync(
        ["bulk-transfer", "create", "--file", "/var/in/transfers.json", "--debit-account", "acct-uuid"],
        { from: "user" },
      ),
    ).rejects.toThrow(/either beneficiary_id or beneficiary/);
  });

  it("throws when the file is empty or not a JSON array", async () => {
    vi.mocked(readFile).mockResolvedValue("[]");

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    program.exitOverride();
    registerBulkTransferCommands(program);

    await expect(
      program.parseAsync(
        ["bulk-transfer", "create", "--file", "/var/in/transfers.json", "--debit-account", "acct-uuid"],
        { from: "user" },
      ),
    ).rejects.toThrow(/non-empty JSON array/);
  });

  it("outputs json format", async () => {
    mockHappyPath();

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerBulkTransferCommands(program);

    await program.parseAsync(
      ["bulk-transfer", "create", "--file", "/var/in/transfers.json", "--debit-account", "acct-uuid"],
      { from: "user" },
    );

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof sampleBulkTransfer;
    expect(parsed.id).toBe("bt-001");
    expect(parsed.total_count).toBe(2);
  });

  it("passes idempotency key header when provided", async () => {
    mockHappyPath();

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerBulkTransferCommands(program);

    await program.parseAsync(
      [
        "bulk-transfer",
        "create",
        "--file",
        "/var/in/transfers.json",
        "--debit-account",
        "acct-uuid",
        "--idempotency-key",
        "idem-key-42",
      ],
      { from: "user" },
    );

    const createCall = fetchSpy.mock.calls.find(([url]: [URL]) => url.pathname === "/v2/sepa/bulk_transfers") as [
      URL,
      RequestInit,
    ];
    const headers = createCall[1].headers as Record<string, string>;
    expect(headers["X-Qonto-Idempotency-Key"]).toBe("idem-key-42");
  });

  it("invokes SCA wrapper around the API call", async () => {
    mockHappyPath();
    const { executeWithCliSca } = await import("../../sca.js");

    const { Command } = await import("commander");
    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerBulkTransferCommands(program);

    await program.parseAsync(
      ["bulk-transfer", "create", "--file", "/var/in/transfers.json", "--debit-account", "acct-uuid"],
      { from: "user" },
    );

    expect(executeWithCliSca).toHaveBeenCalledWith(expect.anything(), expect.any(Function), expect.anything());
  });
});

interface BulkTransferItemSubset {
  readonly client_transfer_id: string;
  readonly beneficiary_id?: string;
  readonly beneficiary?: { readonly name: string; readonly iban: string; readonly bic?: string };
  readonly amount: string;
  readonly reference: string;
}
