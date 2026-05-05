// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerRequestCommands } from "./index.js";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    createFlashCardRequest: vi.fn(),
  };
});

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn(
    (
      _client: unknown,
      operation: (ctx: { scaSessionToken?: string; idempotencyKey: string }) => Promise<unknown>,
      options?: { idempotencyKey?: string },
    ) => operation({ idempotencyKey: options?.idempotencyKey ?? "test-idempotency-key" }),
  ),
}));

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { createFlashCardRequest } = await import("@qontoctl/core");
const createFlashCardRequestMock = vi.mocked(createFlashCardRequest);

describe("request create-flash-card command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a flash card request with all options", async () => {
    const request = {
      id: "req-1",
      request_type: "flash_card" as const,
      status: "pending" as const,
      initiator_id: "user-1",
      approver_id: null,
      note: "Travel expenses",
      declined_note: null,
      payment_lifespan_limit: "500.00",
      pre_expires_at: "2026-06-01T00:00:00.000Z",
      currency: "EUR",
      processed_at: null,
      created_at: "2026-03-01T10:00:00.000Z",
    };
    createFlashCardRequestMock.mockResolvedValue(request);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRequestCommands(program);

    await program.parseAsync(
      [
        "request",
        "create-flash-card",
        "--note",
        "Travel expenses",
        "--payment-lifespan-limit",
        "500.00",
        "--pre-expires-at",
        "2026-06-01T00:00:00.000Z",
      ],
      { from: "user" },
    );

    expect(createFlashCardRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        note: "Travel expenses",
        payment_lifespan_limit: "500.00",
        pre_expires_at: "2026-06-01T00:00:00.000Z",
      },
      expect.anything(),
    );
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("req-1");
    expect(output).toContain("500.00 EUR");
  });

  it("creates a flash card request in json format", async () => {
    const request = {
      id: "req-1",
      request_type: "flash_card" as const,
      status: "pending" as const,
      initiator_id: "user-1",
      approver_id: null,
      note: "",
      declined_note: null,
      payment_lifespan_limit: "0.00",
      pre_expires_at: "2026-06-01T00:00:00.000Z",
      currency: "EUR",
      processed_at: null,
      created_at: "2026-03-01T10:00:00.000Z",
    };
    createFlashCardRequestMock.mockResolvedValue(request);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerRequestCommands(program);

    await program.parseAsync(["request", "create-flash-card"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as { id: string; request_type: string };
    expect(parsed.id).toBe("req-1");
    expect(parsed.request_type).toBe("flash_card");
  });
});
