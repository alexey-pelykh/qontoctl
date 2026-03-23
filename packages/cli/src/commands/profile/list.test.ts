// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createProgram } from "../../program.js";

let mockHomeDir = "";

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  return { ...os, homedir: () => mockHomeDir };
});

describe("profile list", () => {
  let testHome: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testHome = join(tmpdir(), `qontoctl-test-${randomUUID()}`);
    mockHomeDir = testHome;
    await mkdir(testHome, { recursive: true });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(testHome, { recursive: true, force: true });
  });

  it("shows 'No profiles found' when config dir does not exist", async () => {
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "list"], { from: "user" });

    expect(consoleSpy).toHaveBeenCalledWith("No profiles found.");
  });

  it("shows 'No profiles found' when config dir is empty", async () => {
    await mkdir(join(testHome, ".qontoctl"), { recursive: true });

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "list"], { from: "user" });

    expect(consoleSpy).toHaveBeenCalledWith("No profiles found.");
  });

  it("lists profile names from yaml files", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "work.yaml"), "api-key:\n  organization-slug: org\n  secret-key: key\n");
    await writeFile(join(configDir, "personal.yaml"), "api-key:\n  organization-slug: org2\n  secret-key: key2\n");

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "list"], { from: "user" });

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("personal");
    expect(output).toContain("work");
  });

  it("ignores non-yaml files", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "work.yaml"), "api-key:\n  organization-slug: org\n  secret-key: key\n");
    await writeFile(join(configDir, "notes.txt"), "some notes");

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "list"], { from: "user" });

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("work");
    expect(output).not.toContain("notes");
  });

  it("outputs json format with --output json", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "staging.yaml"), "api-key:\n  organization-slug: org\n  secret-key: key\n");

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--output", "json", "profile", "list"], { from: "user" });

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    const parsed: unknown = JSON.parse(output);
    expect(parsed).toEqual([{ name: "staging" }]);
  });
});
