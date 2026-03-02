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
    declineRequest: vi.fn(),
  };
});

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn((_client: unknown, operation: (scaSessionToken?: string) => Promise<unknown>) =>
    operation(undefined),
  ),
}));

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { declineRequest } = await import("@qontoctl/core");
const declineRequestMock = vi.mocked(declineRequest);

describe("request decline command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declines a request with reason", async () => {
    declineRequestMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerRequestCommands(program);

    await program.parseAsync(["request", "decline", "req-1", "--type", "transfer", "--reason", "Not approved"], {
      from: "user",
    });

    expect(declineRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      "transfer",
      "req-1",
      { declined_note: "Not approved" },
      expect.anything(),
    );
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Request req-1 declined.");
  });

  it("declines a request in json format", async () => {
    declineRequestMock.mockResolvedValue(undefined);

    const program = new Command();
    program.option("-o, --output <format>", "", "json");
    registerRequestCommands(program);

    await program.parseAsync(["request", "decline", "req-1", "--type", "flash_card", "--reason", "Denied"], {
      from: "user",
    });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as { declined: boolean; id: string };
    expect(parsed.declined).toBe(true);
    expect(parsed.id).toBe("req-1");
  });
});
