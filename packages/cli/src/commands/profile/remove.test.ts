// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { confirm } from "@clack/prompts";
import { createProgram } from "../../program.js";

let mockHomeDir = "";
let mockConfirmResponse: boolean | symbol = false;
const cancelSymbol = Symbol("cancel");

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  return { ...os, homedir: () => mockHomeDir };
});

vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(),
  isCancel: (value: unknown) => value === cancelSymbol,
}));

describe("profile remove", () => {
  let testHome: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testHome = join(tmpdir(), `qontoctl-test-${randomUUID()}`);
    mockHomeDir = testHome;
    mockConfirmResponse = false;
    await mkdir(testHome, { recursive: true });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(confirm).mockImplementation(() => Promise.resolve(mockConfirmResponse));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await rm(testHome, { recursive: true, force: true });
  });

  it("shows error when profile does not exist", async () => {
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "remove", "nonexistent"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Profile "nonexistent" not found.');
    expect(process.exitCode).toBe(1);
  });

  it("removes profile file when confirmed", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    const filePath = join(configDir, "work.yaml");
    await writeFile(filePath, "api-key:\n  organization-slug: org\n  secret-key: key\n");

    mockConfirmResponse = true;

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "remove", "work"], { from: "user" });

    expect(consoleSpy).toHaveBeenCalledWith('Profile "work" removed.');
    await expect(access(filePath)).rejects.toThrow();
  });

  it("aborts when user does not confirm", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    const filePath = join(configDir, "work.yaml");
    await writeFile(filePath, "api-key:\n  organization-slug: org\n  secret-key: key\n");

    mockConfirmResponse = false;

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "remove", "work"], { from: "user" });

    expect(consoleSpy).toHaveBeenCalledWith("Aborted.");
    // File should still exist
    await expect(access(filePath)).resolves.toBeUndefined();
  });

  it("aborts when user cancels", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    const filePath = join(configDir, "work.yaml");
    await writeFile(filePath, "api-key:\n  organization-slug: org\n  secret-key: key\n");

    mockConfirmResponse = cancelSymbol;

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "remove", "work"], { from: "user" });

    expect(consoleSpy).toHaveBeenCalledWith("Aborted.");
    // File should still exist
    await expect(access(filePath)).resolves.toBeUndefined();
  });
});
