// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { buildApiKeyAuthorization } from "./api-key.js";
import { resolveConfig, ConfigError } from "../config/resolve.js";

/**
 * Integration tests for the API key authentication flow.
 *
 * These tests validate acceptance criteria from WI-4 (#5) by exercising
 * the full config resolution → auth header construction pipeline within
 * @qontoctl/core. Individual unit tests for each function exist in their
 * respective co-located test files; these tests verify the cross-module
 * contract.
 */
describe("API key auth flow", () => {
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

  // AC1: Given a profile with api-key.organization_slug and api-key.secret_key,
  //      When an authenticated request is made,
  //      Then Authorization: {slug}:{key} header is sent (no Base64)
  describe("auth header from profile credentials", () => {
    it("resolves profile credentials into {slug}:{key} auth header", async () => {
      await writeFile(
        join(testDir, ".qontoctl.yaml"),
        "api-key:\n  organization_slug: my-org\n  secret_key: my-secret\n",
      );

      const { config } = await resolveConfig({
        cwd: testDir,
        home: testHome,
        env: {},
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const header = buildApiKeyAuthorization(config.apiKey!);
      expect(header).toBe("my-org:my-secret");
    });

    it("resolves named profile credentials into auth header", async () => {
      const profileDir = join(testHome, ".qontoctl");
      await mkdir(profileDir);
      await writeFile(
        join(profileDir, "production.yaml"),
        "api-key:\n  organization_slug: prod-org\n  secret_key: prod-secret\n",
      );

      const { config } = await resolveConfig({
        profile: "production",
        cwd: testDir,
        home: testHome,
        env: {},
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const header = buildApiKeyAuthorization(config.apiKey!);
      expect(header).toBe("prod-org:prod-secret");
    });
  });

  // AC2: Given a profile missing api-key section,
  //      When auth is attempted,
  //      Then a clear error explains how to configure credentials
  describe("missing credentials error guidance", () => {
    it("describes default search locations when no config exists", async () => {
      const error = await resolveConfig({
        cwd: testDir,
        home: testHome,
        env: {},
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as ConfigError).message;
      expect(message).toMatch(/\.qontoctl\.yaml/);
      expect(message).toMatch(/QONTOCTL_\*/);
    });

    it("describes profile-specific search locations for named profiles", async () => {
      const error = await resolveConfig({
        profile: "staging",
        cwd: testDir,
        home: testHome,
        env: {},
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as ConfigError).message;
      expect(message).toMatch(/staging\.yaml/);
      expect(message).toMatch(/QONTOCTL_STAGING_\*/);
    });

    it("notes found config file when it lacks api-key section", async () => {
      await writeFile(join(testDir, ".qontoctl.yaml"), "future-feature: true\n");

      const error = await resolveConfig({
        cwd: testDir,
        home: testHome,
        env: {},
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as ConfigError).message;
      expect(message).toMatch(/Found config at/);
      expect(message).toMatch(/no api-key credentials/);
    });
  });

  // AC3: Given env var overrides for slug/key,
  //      When auth is attempted,
  //      Then the overridden values are used
  describe("env var overrides flow through to auth header", () => {
    it("builds auth header from env-only credentials", async () => {
      const { config } = await resolveConfig({
        cwd: testDir,
        home: testHome,
        env: {
          QONTOCTL_ORGANIZATION_SLUG: "env-org",
          QONTOCTL_SECRET_KEY: "env-secret",
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const header = buildApiKeyAuthorization(config.apiKey!);
      expect(header).toBe("env-org:env-secret");
    });

    it("builds auth header with env values overriding file values", async () => {
      await writeFile(
        join(testDir, ".qontoctl.yaml"),
        "api-key:\n  organization_slug: file-org\n  secret_key: file-secret\n",
      );

      const { config } = await resolveConfig({
        cwd: testDir,
        home: testHome,
        env: {
          QONTOCTL_ORGANIZATION_SLUG: "override-org",
          QONTOCTL_SECRET_KEY: "override-secret",
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const header = buildApiKeyAuthorization(config.apiKey!);
      expect(header).toBe("override-org:override-secret");
    });

    it("builds auth header from partial env override with file fallback", async () => {
      await writeFile(
        join(testDir, ".qontoctl.yaml"),
        "api-key:\n  organization_slug: file-org\n  secret_key: file-secret\n",
      );

      const { config } = await resolveConfig({
        cwd: testDir,
        home: testHome,
        env: { QONTOCTL_SECRET_KEY: "env-secret" },
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const header = buildApiKeyAuthorization(config.apiKey!);
      expect(header).toBe("file-org:env-secret");
    });

    it("builds auth header from named profile env vars", async () => {
      const { config } = await resolveConfig({
        profile: "staging",
        cwd: testDir,
        home: testHome,
        env: {
          QONTOCTL_STAGING_ORGANIZATION_SLUG: "staging-org",
          QONTOCTL_STAGING_SECRET_KEY: "staging-secret",
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const header = buildApiKeyAuthorization(config.apiKey!);
      expect(header).toBe("staging-org:staging-secret");
    });
  });
});
