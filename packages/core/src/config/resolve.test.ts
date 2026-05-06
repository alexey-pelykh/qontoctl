// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { resolveConfig, resolveScaMethod, ConfigError } from "./resolve.js";

describe("resolveConfig", () => {
  let testDir: string;
  let testHome: string;
  let baseDir: string;

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

  it("resolves config from CWD file", async () => {
    await writeFile(
      join(testDir, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: my-org\n  secret-key: my-secret\n",
    );

    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {},
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "my-org",
      secretKey: "my-secret",
    });
    expect(result.warnings).toEqual([]);
  });

  it("resolves config from home fallback", async () => {
    await writeFile(
      join(testHome, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: home-org\n  secret-key: home-secret\n",
    );

    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {},
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "home-org",
      secretKey: "home-secret",
    });
  });

  it("resolves config from named profile", async () => {
    const profileDir = join(testHome, ".qontoctl");
    await mkdir(profileDir);
    await writeFile(
      join(profileDir, "staging.yaml"),
      "api-key:\n  organization-slug: staging-org\n  secret-key: staging-secret\n",
    );

    const result = await resolveConfig({
      profile: "staging",
      cwd: testDir,
      home: testHome,
      env: {},
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "staging-org",
      secretKey: "staging-secret",
    });
  });

  it("env vars overlay onto file values", async () => {
    await writeFile(
      join(testDir, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: file-org\n  secret-key: file-secret\n",
    );

    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: { QONTOCTL_SECRET_KEY: "env-secret" },
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "file-org",
      secretKey: "env-secret",
    });
  });

  it("resolves credentials from env vars only", async () => {
    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {
        QONTOCTL_ORGANIZATION_SLUG: "env-org",
        QONTOCTL_SECRET_KEY: "env-secret",
      },
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "env-org",
      secretKey: "env-secret",
    });
  });

  it("throws ConfigError when no credentials found", async () => {
    await expect(resolveConfig({ cwd: testDir, home: testHome, env: {} })).rejects.toThrow(ConfigError);
    await expect(resolveConfig({ cwd: testDir, home: testHome, env: {} })).rejects.toThrow(/No credentials found/);
  });

  it("throws ConfigError on schema validation errors", async () => {
    await writeFile(join(testDir, ".qontoctl.yaml"), "api-key: not-a-mapping\n");

    await expect(resolveConfig({ cwd: testDir, home: testHome, env: {} })).rejects.toThrow(ConfigError);
    await expect(resolveConfig({ cwd: testDir, home: testHome, env: {} })).rejects.toThrow(/Invalid configuration/);
  });

  it("throws ConfigError when organization-slug is missing", async () => {
    await writeFile(join(testDir, ".qontoctl.yaml"), "api-key:\n  secret-key: my-secret\n");

    await expect(resolveConfig({ cwd: testDir, home: testHome, env: {} })).rejects.toThrow(
      /Missing required field "organization-slug"/,
    );
  });

  it("throws ConfigError when secret-key is missing", async () => {
    await writeFile(join(testDir, ".qontoctl.yaml"), "api-key:\n  organization-slug: my-org\n");

    await expect(resolveConfig({ cwd: testDir, home: testHome, env: {} })).rejects.toThrow(
      /Missing required field "secret-key"/,
    );
  });

  it("returns warnings for unknown keys", async () => {
    await writeFile(
      join(testDir, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: my-org\n  secret-key: my-secret\n  extra: value\nfuture-feature: true\n",
    );

    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {},
    });
    expect(result.warnings).toContain('Unknown key in "api-key": "extra"');
    expect(result.warnings).toContain('Unknown configuration key: "future-feature"');
    expect(result.config.apiKey).toBeDefined();
  });

  it("named profile env vars overlay correctly", async () => {
    const profileDir = join(testHome, ".qontoctl");
    await mkdir(profileDir);
    await writeFile(
      join(profileDir, "prod.yaml"),
      "api-key:\n  organization-slug: file-org\n  secret-key: file-secret\n",
    );

    const result = await resolveConfig({
      profile: "prod",
      cwd: testDir,
      home: testHome,
      env: { QONTOCTL_PROD_SECRET_KEY: "env-secret" },
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "file-org",
      secretKey: "env-secret",
    });
  });

  it("provides helpful error message for missing named profile", async () => {
    await expect(
      resolveConfig({
        profile: "nonexistent",
        cwd: testDir,
        home: testHome,
        env: {},
      }),
    ).rejects.toThrow(/~\/\.qontoctl\/nonexistent\.yaml/);
  });

  it("describes config path in error when file exists but has no api-key", async () => {
    await writeFile(join(testDir, ".qontoctl.yaml"), "endpoint: https://example.com\n");

    await expect(resolveConfig({ cwd: testDir, home: testHome, env: {} })).rejects.toThrow(
      /Found config at .* but it contains no api-key credentials/,
    );
  });

  it("defaults endpoint to production URL", async () => {
    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {
        QONTOCTL_ORGANIZATION_SLUG: "org",
        QONTOCTL_SECRET_KEY: "secret",
      },
    });
    expect(result.endpoint).toBe("https://thirdparty.qonto.com");
  });

  it("resolves endpoint from config file", async () => {
    await writeFile(
      join(testDir, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: org\n  secret-key: secret\nendpoint: https://custom.example.com\n",
    );

    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {},
    });
    expect(result.endpoint).toBe("https://custom.example.com");
  });

  it("resolves staging endpoint when staging-token is configured in oauth", async () => {
    await writeFile(
      join(testDir, ".qontoctl.yaml"),
      "oauth:\n  client-id: cid\n  client-secret: csecret\n  staging-token: tok_abc123\n",
    );

    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {},
    });
    expect(result.endpoint).toBe("https://thirdparty-sandbox.staging.qonto.co");
  });

  it("explicit endpoint takes precedence over staging-token in oauth", async () => {
    await writeFile(
      join(testDir, ".qontoctl.yaml"),
      "oauth:\n  client-id: cid\n  client-secret: csecret\n  staging-token: tok_abc123\nendpoint: https://custom.example.com\n",
    );

    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {},
    });
    expect(result.endpoint).toBe("https://custom.example.com");
  });

  it("QONTOCTL_ENDPOINT env var takes precedence over staging-token in oauth", async () => {
    await writeFile(
      join(testDir, ".qontoctl.yaml"),
      "oauth:\n  client-id: cid\n  client-secret: csecret\n  staging-token: tok_abc123\n",
    );

    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: { QONTOCTL_ENDPOINT: "https://env.example.com" },
    });
    expect(result.endpoint).toBe("https://env.example.com");
  });

  it("QONTOCTL_STAGING_TOKEN env var resolves to staging endpoint", async () => {
    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {
        QONTOCTL_CLIENT_ID: "cid",
        QONTOCTL_CLIENT_SECRET: "csecret",
        QONTOCTL_STAGING_TOKEN: "tok_abc123",
      },
    });
    expect(result.endpoint).toBe("https://thirdparty-sandbox.staging.qonto.co");
  });

  it("QONTOCTL_ENDPOINT takes precedence over QONTOCTL_STAGING_TOKEN", async () => {
    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {
        QONTOCTL_CLIENT_ID: "cid",
        QONTOCTL_CLIENT_SECRET: "csecret",
        QONTOCTL_ENDPOINT: "https://env.example.com",
        QONTOCTL_STAGING_TOKEN: "tok_abc123",
      },
    });
    expect(result.endpoint).toBe("https://env.example.com");
  });

  it("loads sca.method from config file", async () => {
    await writeFile(
      join(testDir, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: org\n  secret-key: secret\nsca:\n  method: passkey\n",
    );

    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: {},
    });
    expect(result.config.sca?.method).toBe("passkey");
  });

  it("QONTOCTL_SCA_METHOD env var overlays sca.method", async () => {
    await writeFile(
      join(testDir, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: org\n  secret-key: secret\nsca:\n  method: passkey\n",
    );

    const result = await resolveConfig({
      cwd: testDir,
      home: testHome,
      env: { QONTOCTL_SCA_METHOD: "sms-otp" },
    });
    expect(result.config.sca?.method).toBe("sms-otp");
  });
});

describe("resolveScaMethod", () => {
  it("returns override when provided", () => {
    expect(resolveScaMethod({}, "paired-device")).toBe("paired-device");
  });

  it("override wins over config and sandbox default", () => {
    expect(
      resolveScaMethod(
        {
          sca: { method: "passkey" },
          oauth: { clientId: "c", clientSecret: "s", stagingToken: "tok" },
        },
        "paired-device",
      ),
    ).toBe("paired-device");
  });

  it("returns config.sca.method when no override", () => {
    expect(resolveScaMethod({ sca: { method: "sms-otp" } })).toBe("sms-otp");
  });

  it("config wins over sandbox default", () => {
    expect(
      resolveScaMethod({
        sca: { method: "passkey" },
        oauth: { clientId: "c", clientSecret: "s", stagingToken: "tok" },
      }),
    ).toBe("passkey");
  });

  it('returns "mock" when in sandbox and no override or config', () => {
    expect(
      resolveScaMethod({
        oauth: { clientId: "c", clientSecret: "s", stagingToken: "tok" },
      }),
    ).toBe("mock");
  });

  it("does NOT auto-default in production (no staging token)", () => {
    expect(resolveScaMethod({})).toBeUndefined();
    expect(
      resolveScaMethod({
        oauth: { clientId: "c", clientSecret: "s" },
      }),
    ).toBeUndefined();
    expect(
      resolveScaMethod({
        apiKey: { organizationSlug: "org", secretKey: "sec" },
      }),
    ).toBeUndefined();
  });

  it("does NOT auto-default when override is undefined but config has empty sca", () => {
    expect(resolveScaMethod({ sca: {} })).toBeUndefined();
  });

  it("undefined override is treated as no override (falls through to config/default)", () => {
    expect(resolveScaMethod({ sca: { method: "passkey" } }, undefined)).toBe("passkey");
  });
});
