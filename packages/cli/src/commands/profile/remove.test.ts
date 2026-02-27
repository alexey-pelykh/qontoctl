// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createProgram } from "../../program.js";
import { registerProfileCommands } from "./index.js";

let mockHomeDir = "";
let mockQuestionResponses: string[] = [];

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  return { ...os, homedir: () => mockHomeDir };
});

vi.mock("node:readline/promises", () => ({
  createInterface: () => ({
    question: vi.fn().mockImplementation(() => {
      const response = mockQuestionResponses.shift();
      return Promise.resolve(response ?? "");
    }),
    close: vi.fn(),
  }),
}));

describe("profile remove", () => {
  let testHome: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testHome = join(tmpdir(), `qontoctl-test-${randomUUID()}`);
    mockHomeDir = testHome;
    mockQuestionResponses = [];
    await mkdir(testHome, { recursive: true });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await rm(testHome, { recursive: true, force: true });
  });

  it("shows error when profile does not exist", async () => {
    mockQuestionResponses = ["yes"];

    const program = createProgram();
    registerProfileCommands(program);
    program.exitOverride();

    await program.parseAsync(["profile", "remove", "nonexistent"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Profile "nonexistent" not found.');
    expect(process.exitCode).toBe(1);
  });

  it("removes profile file when confirmed", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    const filePath = join(configDir, "work.yaml");
    await writeFile(filePath, "api-key:\n  organization_slug: org\n  secret_key: key\n");

    mockQuestionResponses = ["yes"];

    const program = createProgram();
    registerProfileCommands(program);
    program.exitOverride();

    await program.parseAsync(["profile", "remove", "work"], { from: "user" });

    expect(consoleSpy).toHaveBeenCalledWith('Profile "work" removed.');
    await expect(access(filePath)).rejects.toThrow();
  });

  it("aborts when user does not confirm", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    const filePath = join(configDir, "work.yaml");
    await writeFile(filePath, "api-key:\n  organization_slug: org\n  secret_key: key\n");

    mockQuestionResponses = ["no"];

    const program = createProgram();
    registerProfileCommands(program);
    program.exitOverride();

    await program.parseAsync(["profile", "remove", "work"], { from: "user" });

    expect(consoleSpy).toHaveBeenCalledWith("Aborted.");
    // File should still exist
    await expect(access(filePath)).resolves.toBeUndefined();
  });
});
