// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerTransferCommands } from "./index.js";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    getTransferProof: vi.fn(),
  };
});

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

const { createClient } = await import("../../client.js");
const createClientMock = vi.mocked(createClient);

const { getTransferProof } = await import("@qontoctl/core");
const getTransferProofMock = vi.mocked(getTransferProof);

const { writeFile } = await import("node:fs/promises");
const writeFileMock = vi.mocked(writeFile);

describe("transfer proof command", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    createClientMock.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads proof to default file path", async () => {
    const pdfData = Buffer.from("%PDF-1.4 test");
    getTransferProofMock.mockResolvedValue(pdfData);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(["transfer", "proof", "txfr-1"], { from: "user" });

    expect(getTransferProofMock).toHaveBeenCalledWith(expect.anything(), "txfr-1");
    expect(writeFileMock).toHaveBeenCalledWith("transfer-proof-txfr-1.pdf", pdfData);
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Downloaded: transfer-proof-txfr-1.pdf");
  });

  it("downloads proof to custom file path", async () => {
    const pdfData = Buffer.from("%PDF-1.4 test");
    getTransferProofMock.mockResolvedValue(pdfData);

    const program = new Command();
    program.option("-o, --output <format>", "", "table");
    registerTransferCommands(program);

    await program.parseAsync(["transfer", "proof", "txfr-1", "--output-file", "/tmp/my-proof.pdf"], { from: "user" });

    expect(writeFileMock).toHaveBeenCalledWith("/tmp/my-proof.pdf", pdfData);
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Downloaded: /tmp/my-proof.pdf");
  });
});
