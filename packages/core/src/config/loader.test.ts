// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { loadConfigFile, resolveConfigFilePath } from "./loader.js";
import { ConfigError } from "./resolve.js";

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

  it("returns undefined when home default does not exist and no other source is provided", async () => {
    const result = await loadConfigFile({ home: testHome });
    expect(result.raw).toBeUndefined();
    expect(result.path).toBeUndefined();
  });

  it("loads explicit path when provided", async () => {
    const explicitPath = join(testDir, "custom.yaml");
    await writeFile(explicitPath, "api-key:\n  organization-slug: explicit-org\n  secret-key: x\n");

    const result = await loadConfigFile({ path: explicitPath, home: testHome });
    expect(result.path).toBe(explicitPath);
    expect(result.raw).toEqual({
      "api-key": { "organization-slug": "explicit-org", "secret-key": "x" },
    });
  });

  it("loads ~/.qontoctl.yaml as the home default", async () => {
    const homePath = join(testHome, ".qontoctl.yaml");
    await writeFile(homePath, "api-key:\n  organization-slug: home-org\n  secret-key: home-secret\n");

    const result = await loadConfigFile({ home: testHome });
    expect(result.path).toBe(homePath);
    expect(result.raw).toEqual({
      "api-key": { "organization-slug": "home-org", "secret-key": "home-secret" },
    });
  });

  it("loads from QONTOCTL_CONFIG_FILE env var when set", async () => {
    const envPath = join(testDir, "env-config.yaml");
    await writeFile(envPath, "api-key:\n  organization-slug: env-org\n  secret-key: x\n");

    const result = await loadConfigFile({ env: { QONTOCTL_CONFIG_FILE: envPath }, home: testHome });
    expect(result.path).toBe(envPath);
    expect(result.raw).toEqual({
      "api-key": { "organization-slug": "env-org", "secret-key": "x" },
    });
  });

  it("loads named profile from ~/.qontoctl/{name}.yaml", async () => {
    const profileDir = join(testHome, ".qontoctl");
    await mkdir(profileDir, { recursive: true });
    const profilePath = join(profileDir, "staging.yaml");
    await writeFile(profilePath, "api-key:\n  organization-slug: staging-org\n  secret-key: staging-secret\n");

    const result = await loadConfigFile({
      profile: "staging",
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
      home: testHome,
    });
    expect(result.raw).toBeUndefined();
    expect(result.path).toBeUndefined();
  });

  it("does NOT inspect process.cwd at any stage", async () => {
    // The loader must not fall through to process.cwd when the home default
    // is empty. With only `home` (pointing at an empty dir) supplied, the
    // result must be no-hit — even when running from the qontoctl repo root
    // where a real `.qontoctl.yaml` sits in process.cwd. If the loader ever
    // regresses to walking up from cwd, this assertion fails locally (where
    // a real cwd config exists). In CI without a cwd config it passes
    // vacuously; the resolve.test.ts companion is the stronger guard there.
    const result = await loadConfigFile({ home: testHome });
    expect(result.raw).toBeUndefined();
    expect(result.path).toBeUndefined();
  });

  it("throws ConfigError PARSE on malformed YAML", async () => {
    const badPath = join(testHome, ".qontoctl.yaml");
    await writeFile(badPath, ":\n  :\n  invalid: [unclosed");

    await expect(loadConfigFile({ home: testHome })).rejects.toMatchObject({
      name: "ConfigError",
      code: "PARSE",
    });
  });

  it("ConfigError PARSE includes the path in the message", async () => {
    const badPath = join(testHome, ".qontoctl.yaml");
    await writeFile(badPath, ":\n  :\n  invalid: [unclosed");

    await expect(loadConfigFile({ home: testHome })).rejects.toThrow(badPath);
  });

  it("explicit path: nonexistent file returns no-hit (no error)", async () => {
    const result = await loadConfigFile({ path: join(testDir, "missing.yaml"), home: testHome });
    expect(result.raw).toBeUndefined();
    expect(result.path).toBeUndefined();
  });

  it("ConfigError thrown by loader survives the wrapping (instance-of check)", async () => {
    const badPath = join(testHome, ".qontoctl.yaml");
    // Unclosed flow sequence — yaml parser rejects this with a syntax error.
    await writeFile(badPath, "api-key:\n  foo: [unclosed\n");

    await expect(loadConfigFile({ home: testHome })).rejects.toBeInstanceOf(ConfigError);
  });
});

describe("resolveConfigFilePath", () => {
  // Use platform-native path separators so the assertions hold on
  // Windows (`\`) and POSIX (`/`) alike — `node:path/join` returns
  // platform-specific separators.
  const HOME = join("home", "u");

  it("returns explicit path", () => {
    expect(resolveConfigFilePath({ path: "/abs/path.yaml" })).toBe("/abs/path.yaml");
  });

  it("returns env var value when no explicit path", () => {
    expect(
      resolveConfigFilePath({
        env: { QONTOCTL_CONFIG_FILE: "/from-env.yaml" },
        home: HOME,
      }),
    ).toBe("/from-env.yaml");
  });

  it("ignores empty-string env var (treats as unset)", () => {
    expect(
      resolveConfigFilePath({
        env: { QONTOCTL_CONFIG_FILE: "" },
        home: HOME,
      }),
    ).toBe(join(HOME, ".qontoctl.yaml"));
  });

  it("returns profile-derived path when profile is set", () => {
    expect(resolveConfigFilePath({ profile: "prod", home: HOME })).toBe(join(HOME, ".qontoctl", "prod.yaml"));
  });

  it("falls through to home default", () => {
    expect(resolveConfigFilePath({ home: HOME })).toBe(join(HOME, ".qontoctl.yaml"));
  });

  it("explicit path beats env-var beats profile", () => {
    expect(
      resolveConfigFilePath({
        path: "/from-arg.yaml",
        env: { QONTOCTL_CONFIG_FILE: "/from-env.yaml" },
        profile: "prod",
        home: HOME,
      }),
    ).toBe("/from-arg.yaml");

    expect(
      resolveConfigFilePath({
        env: { QONTOCTL_CONFIG_FILE: "/from-env.yaml" },
        profile: "prod",
        home: HOME,
      }),
    ).toBe("/from-env.yaml");
  });
});
