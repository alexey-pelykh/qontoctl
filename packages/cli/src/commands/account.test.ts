// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerAccountCommands } from "./account.js";
import type { PaginationMeta } from "../pagination.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    getBankAccount: vi.fn(),
  };
});

const { createClient } = await import("../client.js");
const createClientMock = vi.mocked(createClient);

const { getBankAccount } = await import("@qontoctl/core");
const getBankAccountMock = vi.mocked(getBankAccount);

function makeMeta(
  overrides: Partial<PaginationMeta> = {},
): PaginationMeta {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 0,
    per_page: 100,
    ...overrides,
  };
}

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc-1",
    name: "Main Account",
    status: "active",
    main: true,
    organization_id: "org-1",
    iban: "FR7630001007941234567890185",
    bic: "BNPAFRPP",
    currency: "EUR",
    balance: 10000,
    balance_cents: 1000000,
    authorized_balance: 9500,
    authorized_balance_cents: 950000,
    slug: "main",
    ...overrides,
  };
}

describe("registerAccountCommands", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers an account command group", () => {
    const program = new Command();
    registerAccountCommands(program);

    const accountCommand = program.commands.find(
      (c) => c.name() === "account",
    );
    expect(accountCommand).toBeDefined();
  });

  it("registers the list subcommand under account", () => {
    const program = new Command();
    registerAccountCommands(program);

    const accountCommand = program.commands.find(
      (c) => c.name() === "account",
    );
    const listCommand = accountCommand?.commands.find(
      (c) => c.name() === "list",
    );
    expect(listCommand).toBeDefined();
    expect(listCommand?.description()).toBe("List bank accounts");
  });

  it("registers the show subcommand under account with id argument", () => {
    const program = new Command();
    registerAccountCommands(program);

    const accountCommand = program.commands.find(
      (c) => c.name() === "account",
    );
    const showCommand = accountCommand?.commands.find(
      (c) => c.name() === "show",
    );
    expect(showCommand).toBeDefined();
    expect(showCommand?.description()).toBe("Show bank account details");

    const args = showCommand?.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args?.[0]?.name()).toBe("id");
    expect(args?.[0]?.required).toBe(true);
  });

  describe("account list", () => {
    it("lists bank accounts in table format", async () => {
      const accounts = [
        makeAccount(),
        makeAccount({ id: "acc-2", name: "Savings", balance: 5000 }),
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_accounts: accounts,
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const { HttpClient } = await import("@qontoctl/core");
      const client = new HttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });
      createClientMock.mockResolvedValue(client);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      program.option("--no-paginate", "");
      registerAccountCommands(program);

      await program.parseAsync(["account", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("acc-1");
      expect(output).toContain("Main Account");
      expect(output).toContain("acc-2");
      expect(output).toContain("Savings");
    });

    it("lists bank accounts in json format", async () => {
      const accounts = [makeAccount()];
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_accounts: accounts,
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const { HttpClient } = await import("@qontoctl/core");
      const client = new HttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });
      createClientMock.mockResolvedValue(client);

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      program.option("--no-paginate", "");
      registerAccountCommands(program);

      await program.parseAsync(["account", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
    });
  });

  describe("account show", () => {
    it("shows bank account details in table format", async () => {
      const account = makeAccount();
      getBankAccountMock.mockResolvedValue(account);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAccountCommands(program);

      await program.parseAsync(["account", "show", "acc-1"], {
        from: "user",
      });

      expect(getBankAccountMock).toHaveBeenCalledWith(
        expect.anything(),
        "acc-1",
      );
      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("acc-1");
      expect(output).toContain("Main Account");
      expect(output).toContain("active");
    });

    it("shows bank account details in json format", async () => {
      const account = makeAccount();
      getBankAccountMock.mockResolvedValue(account);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      registerAccountCommands(program);

      await program.parseAsync(["account", "show", "acc-1"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as typeof account;
      expect(parsed.id).toBe("acc-1");
      expect(parsed.name).toBe("Main Account");
      expect(parsed.iban).toBe("FR7630001007941234567890185");
    });

    it("shows bank account details in yaml format", async () => {
      const account = makeAccount();
      getBankAccountMock.mockResolvedValue(account);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "yaml");
      registerAccountCommands(program);

      await program.parseAsync(["account", "show", "acc-1"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("id: acc-1");
      expect(output).toContain("name: Main Account");
    });
  });
});
