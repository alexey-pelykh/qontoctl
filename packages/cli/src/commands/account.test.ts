// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { jsonResponse } from "@qontoctl/core/testing";
import { registerAccountCommands } from "./account.js";
import type { PaginationMeta } from "../pagination.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    getBankAccount: vi.fn(),
    getIbanCertificate: vi.fn(),
    createBankAccount: vi.fn(),
    updateBankAccount: vi.fn(),
    closeBankAccount: vi.fn(),
  };
});

vi.mock("../sca.js", () => ({
  executeWithCliSca: vi.fn((_client: unknown, operation: (scaSessionToken?: string) => Promise<unknown>) =>
    operation(undefined),
  ),
}));

const { createClient } = await import("../client.js");
const createClientMock = vi.mocked(createClient);

const { getBankAccount, getIbanCertificate, createBankAccount, updateBankAccount, closeBankAccount } =
  await import("@qontoctl/core");
const getBankAccountMock = vi.mocked(getBankAccount);
const getIbanCertificateMock = vi.mocked(getIbanCertificate);
const createBankAccountMock = vi.mocked(createBankAccount);
const updateBankAccountMock = vi.mocked(updateBankAccount);
const closeBankAccountMock = vi.mocked(closeBankAccount);

const { writeFile } = await import("node:fs/promises");
const writeFileMock = vi.mocked(writeFile);

function makeMeta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
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
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers an account command group", () => {
    const program = new Command();
    registerAccountCommands(program);

    const accountCommand = program.commands.find((c) => c.name() === "account");
    expect(accountCommand).toBeDefined();
  });

  it("registers the list subcommand under account", () => {
    const program = new Command();
    registerAccountCommands(program);

    const accountCommand = program.commands.find((c) => c.name() === "account");
    const listCommand = accountCommand?.commands.find((c) => c.name() === "list");
    expect(listCommand).toBeDefined();
    expect(listCommand?.description()).toBe("List bank accounts");
  });

  it("registers the show subcommand under account with id argument", () => {
    const program = new Command();
    registerAccountCommands(program);

    const accountCommand = program.commands.find((c) => c.name() === "account");
    const showCommand = accountCommand?.commands.find((c) => c.name() === "show");
    expect(showCommand).toBeDefined();
    expect(showCommand?.description()).toBe("Show bank account details");

    const args = showCommand?.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args?.[0]?.name()).toBe("id");
    expect(args?.[0]?.required).toBe(true);
  });

  describe("account list", () => {
    it("lists bank accounts in table format", async () => {
      const accounts = [makeAccount(), makeAccount({ id: "acc-2", name: "Savings", balance: 5000 })];
      fetchSpy.mockImplementation(() =>
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
      fetchSpy.mockImplementation(() =>
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

      expect(getBankAccountMock).toHaveBeenCalledWith(expect.anything(), "acc-1");
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

  describe("account iban-certificate", () => {
    it("registers the iban-certificate subcommand under account with id argument", () => {
      const program = new Command();
      registerAccountCommands(program);

      const accountCommand = program.commands.find((c) => c.name() === "account");
      const ibanCertCommand = accountCommand?.commands.find((c) => c.name() === "iban-certificate");
      expect(ibanCertCommand).toBeDefined();
      expect(ibanCertCommand?.description()).toBe("Download IBAN certificate PDF");

      const args = ibanCertCommand?.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args?.[0]?.name()).toBe("id");
      expect(args?.[0]?.required).toBe(true);
    });

    it("downloads IBAN certificate with default filename", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 test");
      getIbanCertificateMock.mockResolvedValue(pdfBuffer);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAccountCommands(program);

      await program.parseAsync(["account", "iban-certificate", "acc-1"], {
        from: "user",
      });

      expect(getIbanCertificateMock).toHaveBeenCalledWith(expect.anything(), "acc-1");
      expect(writeFileMock).toHaveBeenCalledWith("iban-certificate-acc-1.pdf", pdfBuffer);
      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Downloaded: iban-certificate-acc-1.pdf");
    });

    it("downloads IBAN certificate with custom filename", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 test");
      getIbanCertificateMock.mockResolvedValue(pdfBuffer);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAccountCommands(program);

      await program.parseAsync(["account", "iban-certificate", "acc-1", "--output-file", "my-cert.pdf"], {
        from: "user",
      });

      expect(writeFileMock).toHaveBeenCalledWith("my-cert.pdf", pdfBuffer);
      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Downloaded: my-cert.pdf");
    });
  });

  describe("account create", () => {
    it("creates a bank account in table format", async () => {
      const account = makeAccount({ name: "New Account" });
      createBankAccountMock.mockResolvedValue(account);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAccountCommands(program);

      await program.parseAsync(["account", "create", "--name", "New Account"], { from: "user" });

      expect(createBankAccountMock).toHaveBeenCalledWith(expect.anything(), { name: "New Account" }, expect.anything());
      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("acc-1");
      expect(output).toContain("New Account");
    });

    it("creates a bank account in json format", async () => {
      const account = makeAccount({ name: "New Account" });
      createBankAccountMock.mockResolvedValue(account);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      registerAccountCommands(program);

      await program.parseAsync(["account", "create", "--name", "New Account"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as typeof account;
      expect(parsed.id).toBe("acc-1");
      expect(parsed.name).toBe("New Account");
    });
  });

  describe("account update", () => {
    it("updates a bank account in table format", async () => {
      const account = makeAccount({ name: "Updated Name" });
      updateBankAccountMock.mockResolvedValue(account);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAccountCommands(program);

      await program.parseAsync(["account", "update", "acc-1", "--name", "Updated Name"], { from: "user" });

      expect(updateBankAccountMock).toHaveBeenCalledWith(
        expect.anything(),
        "acc-1",
        { name: "Updated Name" },
        expect.anything(),
      );
      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("acc-1");
      expect(output).toContain("Updated Name");
    });

    it("updates a bank account in json format", async () => {
      const account = makeAccount({ name: "Updated Name" });
      updateBankAccountMock.mockResolvedValue(account);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      registerAccountCommands(program);

      await program.parseAsync(["account", "update", "acc-1", "--name", "Updated Name"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as typeof account;
      expect(parsed.id).toBe("acc-1");
      expect(parsed.name).toBe("Updated Name");
    });
  });

  describe("account close", () => {
    it("closes a bank account with --yes flag", async () => {
      closeBankAccountMock.mockResolvedValue(undefined);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAccountCommands(program);

      await program.parseAsync(["account", "close", "acc-1", "--yes"], { from: "user" });

      expect(closeBankAccountMock).toHaveBeenCalledWith(expect.anything(), "acc-1", expect.anything());
      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Account acc-1 closed.");
    });

    it("closes a bank account in json format", async () => {
      closeBankAccountMock.mockResolvedValue(undefined);
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "json");
      registerAccountCommands(program);

      await program.parseAsync(["account", "close", "acc-1", "--yes"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as { closed: boolean; id: string };
      expect(parsed.closed).toBe(true);
      expect(parsed.id).toBe("acc-1");
    });

    it("exits with error when --yes is not provided", async () => {
      createClientMock.mockResolvedValue({} as never);

      const program = new Command();
      program.option("-o, --output <format>", "", "table");
      registerAccountCommands(program);

      await program.parseAsync(["account", "close", "acc-1"], { from: "user" });

      expect(stderrSpy).toHaveBeenCalled();
      const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
      expect(errorOutput).toContain("About to close account acc-1");
      expect(errorOutput).toContain("--yes");
      expect(process.exitCode).toBe(1);
    });
  });
});
