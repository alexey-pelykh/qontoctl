// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { loadConfigFile } from "./loader.js";

describe("loadConfigFile", () => {
  let baseDir: string;
  let testDir: string;
  let testHome: string;

  beforeEach(async () => {
    baseDir = join(tmpdir(), `qontoctl-test-${randomUUID()}`);
    testDir = join(baseDir, "project");
    testHome = join(baseDir, "home");
    await mkdir(testDir, { recursive: true });
    await mkdir(testHome, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("returns undefined when no config file exists", async () => {
    const result = await loadConfigFile({ cwd: testDir, home: testHome });
    expect(result.raw).toBeUndefined();
    expect(result.path).toBeUndefined();
  });

  it("loads .qontoctl.yaml from CWD", async () => {
    const configPath = join(testDir, ".qontoctl.yaml");
    await writeFile(configPath, "api-key:\n  organization-slug: cwd-org\n  secret-key: cwd-secret\n");

    const result = await loadConfigFile({ cwd: testDir, home: testHome });
    expect(result.path).toBe(configPath);
    expect(result.raw).toEqual({
      "api-key": { "organization-slug": "cwd-org", "secret-key": "cwd-secret" },
    });
  });

  it("falls back to ~/.qontoctl.yaml when CWD has no config", async () => {
    const homePath = join(testHome, ".qontoctl.yaml");
    await writeFile(homePath, "api-key:\n  organization-slug: home-org\n  secret-key: home-secret\n");

    const result = await loadConfigFile({ cwd: testDir, home: testHome });
    expect(result.path).toBe(homePath);
    expect(result.raw).toEqual({
      "api-key": { "organization-slug": "home-org", "secret-key": "home-secret" },
    });
  });

  it("prefers CWD config over home config", async () => {
    await writeFile(
      join(testDir, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: cwd-org\n  secret-key: cwd-secret\n",
    );
    await writeFile(
      join(testHome, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: home-org\n  secret-key: home-secret\n",
    );

    const result = await loadConfigFile({ cwd: testDir, home: testHome });
    expect(result.raw).toEqual({
      "api-key": { "organization-slug": "cwd-org", "secret-key": "cwd-secret" },
    });
  });

  it("loads named profile from ~/.qontoctl/{name}.yaml", async () => {
    const profileDir = join(testHome, ".qontoctl");
    await mkdir(profileDir, { recursive: true });
    const profilePath = join(profileDir, "staging.yaml");
    await writeFile(profilePath, "api-key:\n  organization-slug: staging-org\n  secret-key: staging-secret\n");

    const result = await loadConfigFile({
      profile: "staging",
      cwd: testDir,
      home: testHome,
    });
    expect(result.path).toBe(profilePath);
    expect(result.raw).toEqual({
      "api-key": {
        "organization-slug": "staging-org",
        "secret-key": "staging-secret",
      },
    });
  });

  it("returns undefined when named profile file does not exist", async () => {
    const result = await loadConfigFile({
      profile: "nonexistent",
      cwd: testDir,
      home: testHome,
    });
    expect(result.raw).toBeUndefined();
    expect(result.path).toBeUndefined();
  });

  it("handles empty YAML file", async () => {
    await writeFile(join(testDir, ".qontoctl.yaml"), "");

    const result = await loadConfigFile({ cwd: testDir, home: testHome });
    expect(result.raw).toBeNull();
    expect(result.path).toBe(join(testDir, ".qontoctl.yaml"));
  });

  it("throws on malformed YAML", async () => {
    await writeFile(join(testDir, ".qontoctl.yaml"), ":\n  :\n  invalid: [unclosed");

    await expect(loadConfigFile({ cwd: testDir, home: testHome })).rejects.toThrow(/Failed to read config file/);
  });
});
