// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { resolveConfig, resolveConfigPath, resolveScaMethod, ConfigError } from "./resolve.js";

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

  it("resolves config from explicit path", async () => {
    const cfgPath = join(testDir, ".qontoctl.yaml");
    await writeFile(cfgPath, "api-key:\n  organization-slug: my-org\n  secret-key: my-secret\n");

    const result = await resolveConfig({
      path: cfgPath,
      home: testHome,
      env: {},
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "my-org",
      secretKey: "my-secret",
    });
    expect(result.warnings).toEqual([]);
    expect(result.path).toBe(cfgPath);
  });

  it("resolves config from home default when no path or profile is given", async () => {
    await writeFile(
      join(testHome, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: home-org\n  secret-key: home-secret\n",
    );

    const result = await resolveConfig({
      home: testHome,
      env: {},
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "home-org",
      secretKey: "home-secret",
    });
    expect(result.path).toBe(join(testHome, ".qontoctl.yaml"));
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
      home: testHome,
      env: {},
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "staging-org",
      secretKey: "staging-secret",
    });
    expect(result.path).toBe(join(profileDir, "staging.yaml"));
  });

  describe("path precedence (issue #479)", () => {
    it("explicit path beats QONTOCTL_CONFIG_FILE env var", async () => {
      const explicitPath = join(testDir, ".qontoctl.yaml");
      const envPath = join(testHome, "env-config.yaml");
      await writeFile(explicitPath, "api-key:\n  organization-slug: explicit\n  secret-key: x\n");
      await writeFile(envPath, "api-key:\n  organization-slug: from-env\n  secret-key: x\n");

      const result = await resolveConfig({
        path: explicitPath,
        home: testHome,
        env: { QONTOCTL_CONFIG_FILE: envPath },
      });
      expect(result.config.apiKey?.organizationSlug).toBe("explicit");
      expect(result.path).toBe(explicitPath);
    });

    it("QONTOCTL_CONFIG_FILE beats profile-derived path", async () => {
      const envPath = join(testDir, "env-config.yaml");
      const profileDir = join(testHome, ".qontoctl");
      await mkdir(profileDir);
      await writeFile(envPath, "api-key:\n  organization-slug: from-env\n  secret-key: x\n");
      await writeFile(join(profileDir, "prod.yaml"), "api-key:\n  organization-slug: from-profile\n  secret-key: x\n");

      const result = await resolveConfig({
        profile: "prod",
        home: testHome,
        env: { QONTOCTL_CONFIG_FILE: envPath },
      });
      expect(result.config.apiKey?.organizationSlug).toBe("from-env");
      expect(result.path).toBe(envPath);
    });

    it("profile beats home default", async () => {
      const profileDir = join(testHome, ".qontoctl");
      await mkdir(profileDir);
      await writeFile(join(profileDir, "prod.yaml"), "api-key:\n  organization-slug: from-profile\n  secret-key: x\n");
      await writeFile(join(testHome, ".qontoctl.yaml"), "api-key:\n  organization-slug: from-home\n  secret-key: x\n");

      const result = await resolveConfig({
        profile: "prod",
        home: testHome,
        env: {},
      });
      expect(result.config.apiKey?.organizationSlug).toBe("from-profile");
    });

    it("does NOT inspect process.cwd at any stage (no CWD discovery)", async () => {
      // Even when a .qontoctl.yaml exists in process.cwd, the resolver
      // ignores it. Only path/env/profile/home defaults are honored.
      // This is the load/write divergence elimination from #479.
      const result = await resolveConfig({
        home: testHome,
        env: {
          QONTOCTL_ORGANIZATION_SLUG: "from-env",
          QONTOCTL_SECRET_KEY: "x",
        },
      });
      expect(result.config.apiKey?.organizationSlug).toBe("from-env");
      // path is undefined when no file was loaded
      expect(result.path).toBeUndefined();
    });
  });

  describe("profile name validation (issue #479)", () => {
    it.each([
      ["../etc/passwd", "path traversal"],
      ["..", "parent directory reference"],
      ["a/b", "path separator"],
      ["a\\b", "windows path separator"],
      ["star*glob", "glob char *"],
      ["q?mark", "glob char ?"],
      ["bracket[ed]", "glob char ["],
      ["", "empty"],
      ["endpoint", "reserved suffix ENDPOINT"],
      ["client-id", "reserved suffix CLIENT_ID (with - normalized)"],
      ["access_token", "reserved suffix ACCESS_TOKEN"],
      ["config-file", "reserved suffix CONFIG_FILE"],
      ["sca-method", "reserved suffix SCA_METHOD"],
    ])('rejects "%s" (%s)', async (profile) => {
      await expect(
        resolveConfig({
          profile,
          home: testHome,
          env: {},
        }),
      ).rejects.toMatchObject({
        name: "ConfigError",
        code: "VALIDATION",
      });
    });

    it("accepts ordinary profile names", async () => {
      const profileDir = join(testHome, ".qontoctl");
      await mkdir(profileDir);
      await writeFile(join(profileDir, "production-eu.yaml"), "api-key:\n  organization-slug: org\n  secret-key: x\n");

      const result = await resolveConfig({
        profile: "production-eu",
        home: testHome,
        env: {},
      });
      expect(result.config.apiKey?.organizationSlug).toBe("org");
    });
  });

  it("env vars overlay onto file values", async () => {
    await writeFile(
      join(testHome, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: file-org\n  secret-key: file-secret\n",
    );

    const result = await resolveConfig({
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

  it("throws ConfigError NO_CREDS when no credentials found", async () => {
    await expect(resolveConfig({ home: testHome, env: {} })).rejects.toThrow(ConfigError);
    await expect(resolveConfig({ home: testHome, env: {} })).rejects.toMatchObject({
      code: "NO_CREDS",
    });
    await expect(resolveConfig({ home: testHome, env: {} })).rejects.toThrow(/No credentials found/);
  });

  it("throws ConfigError VALIDATION on schema validation errors", async () => {
    await writeFile(join(testHome, ".qontoctl.yaml"), "api-key: not-a-mapping\n");

    await expect(resolveConfig({ home: testHome, env: {} })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(resolveConfig({ home: testHome, env: {} })).rejects.toThrow(/Invalid configuration/);
  });

  it("throws ConfigError when organization-slug is missing", async () => {
    await writeFile(join(testHome, ".qontoctl.yaml"), "api-key:\n  secret-key: my-secret\n");

    await expect(resolveConfig({ home: testHome, env: {} })).rejects.toThrow(
      /Missing required field "organization-slug"/,
    );
  });

  it("throws ConfigError when secret-key is missing", async () => {
    await writeFile(join(testHome, ".qontoctl.yaml"), "api-key:\n  organization-slug: my-org\n");

    await expect(resolveConfig({ home: testHome, env: {} })).rejects.toThrow(/Missing required field "secret-key"/);
  });

  it("returns warnings for unknown keys", async () => {
    await writeFile(
      join(testHome, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: my-org\n  secret-key: my-secret\n  extra: value\nfuture-feature: true\n",
    );

    const result = await resolveConfig({
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
        home: testHome,
        env: {},
      }),
    ).rejects.toThrow(/~\/\.qontoctl\/nonexistent\.yaml/);
  });

  it("describes config path in error when file exists but has no api-key", async () => {
    const cfgPath = join(testHome, ".qontoctl.yaml");
    await writeFile(cfgPath, "endpoint: https://example.com\n");

    await expect(resolveConfig({ home: testHome, env: {} })).rejects.toThrow(
      /Found config at .* but it contains no credentials/,
    );
  });

  it("defaults endpoint to production URL", async () => {
    const result = await resolveConfig({
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
      join(testHome, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: org\n  secret-key: secret\nendpoint: https://custom.example.com\n",
    );

    const result = await resolveConfig({
      home: testHome,
      env: {},
    });
    expect(result.endpoint).toBe("https://custom.example.com");
  });

  it("resolves staging endpoint when staging-token is configured in oauth", async () => {
    await writeFile(
      join(testHome, ".qontoctl.yaml"),
      "oauth:\n  client-id: cid\n  client-secret: csecret\n  staging-token: tok_abc123\n",
    );

    const result = await resolveConfig({
      home: testHome,
      env: {},
    });
    expect(result.endpoint).toBe("https://thirdparty-sandbox.staging.qonto.co");
  });

  it("explicit endpoint takes precedence over staging-token in oauth", async () => {
    await writeFile(
      join(testHome, ".qontoctl.yaml"),
      "oauth:\n  client-id: cid\n  client-secret: csecret\n  staging-token: tok_abc123\nendpoint: https://custom.example.com\n",
    );

    const result = await resolveConfig({
      home: testHome,
      env: {},
    });
    expect(result.endpoint).toBe("https://custom.example.com");
  });

  it("QONTOCTL_ENDPOINT env var takes precedence over staging-token in oauth", async () => {
    await writeFile(
      join(testHome, ".qontoctl.yaml"),
      "oauth:\n  client-id: cid\n  client-secret: csecret\n  staging-token: tok_abc123\n",
    );

    const result = await resolveConfig({
      home: testHome,
      env: { QONTOCTL_ENDPOINT: "https://env.example.com" },
    });
    expect(result.endpoint).toBe("https://env.example.com");
  });

  it("QONTOCTL_STAGING_TOKEN env var resolves to staging endpoint", async () => {
    const result = await resolveConfig({
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
      join(testHome, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: org\n  secret-key: secret\nsca:\n  method: passkey\n",
    );

    const result = await resolveConfig({
      home: testHome,
      env: {},
    });
    expect(result.config.sca?.method).toBe("passkey");
  });

  it("QONTOCTL_SCA_METHOD env var overlays sca.method", async () => {
    await writeFile(
      join(testHome, ".qontoctl.yaml"),
      "api-key:\n  organization-slug: org\n  secret-key: secret\nsca:\n  method: passkey\n",
    );

    const result = await resolveConfig({
      home: testHome,
      env: { QONTOCTL_SCA_METHOD: "sms-otp" },
    });
    expect(result.config.sca?.method).toBe("sms-otp");
  });

  describe("oauthAccessTokenFromEnv flag (issue #495)", () => {
    it("is false when no env access-token is set", async () => {
      await writeFile(
        join(testHome, ".qontoctl.yaml"),
        "oauth:\n  client-id: cid\n  client-secret: csecret\n  access-token: file-at\n  refresh-token: file-rt\n",
      );

      const result = await resolveConfig({ home: testHome, env: {} });
      expect(result.oauthAccessTokenFromEnv).toBe(false);
      expect(result.config.oauth?.accessToken).toBe("file-at");
    });

    it("is true when QONTOCTL_ACCESS_TOKEN is set in env", async () => {
      const result = await resolveConfig({
        home: testHome,
        env: {
          QONTOCTL_CLIENT_ID: "cid",
          QONTOCTL_CLIENT_SECRET: "csecret",
          QONTOCTL_ACCESS_TOKEN: "env-at",
        },
      });
      expect(result.oauthAccessTokenFromEnv).toBe(true);
      expect(result.config.oauth?.accessToken).toBe("env-at");
    });

    it("is true and overrides file access-token when env has QONTOCTL_ACCESS_TOKEN", async () => {
      await writeFile(
        join(testHome, ".qontoctl.yaml"),
        "oauth:\n  client-id: cid\n  client-secret: csecret\n  access-token: file-at\n  refresh-token: file-rt\n",
      );

      const result = await resolveConfig({
        home: testHome,
        env: { QONTOCTL_ACCESS_TOKEN: "env-at" },
      });
      expect(result.oauthAccessTokenFromEnv).toBe(true);
      expect(result.config.oauth?.accessToken).toBe("env-at");
      // File's refresh-token is preserved (env never overrode it; file is
      // the source of truth for runtime-mutable fields)
      expect(result.config.oauth?.refreshToken).toBe("file-rt");
    });

    it("env-only QONTOCTL_ACCESS_TOKEN without file or client creds surfaces NO_CREDS, not 'missing client-id' (issue #479)", async () => {
      // Pre-#479: env access-token alone synthesized an oauth block with
      // empty client-id, then resolve.ts threw "Missing required field
      // 'client-id'" — misleading: the user never asked to set client-id.
      // Post-#479: env access-token alone is insufficient (client creds
      // cannot be resolved from any source) — NO_CREDS surfaces accurately.
      await expect(
        resolveConfig({
          home: testHome,
          env: { QONTOCTL_ACCESS_TOKEN: "env-at" },
        }),
      ).rejects.toMatchObject({ code: "NO_CREDS" });
    });
  });

  describe("runtime-mutable OAuth fields preserved through env-overlay (issue #495)", () => {
    it("preserves refreshToken from file even when env supplies static OAuth fields", async () => {
      await writeFile(
        join(testHome, ".qontoctl.yaml"),
        "oauth:\n" +
          "  client-id: file-cid\n" +
          "  client-secret: file-csecret\n" +
          "  access-token: file-at\n" +
          "  refresh-token: file-rt\n" +
          "  access-token-expires-at: '2026-12-31T23:59:59Z'\n" +
          "  scopes:\n    - organizations.read\n    - transactions.read\n",
      );

      const result = await resolveConfig({
        home: testHome,
        env: {
          QONTOCTL_CLIENT_ID: "env-cid",
          QONTOCTL_CLIENT_SECRET: "env-csecret",
        },
      });

      // Static fields overlaid from env
      expect(result.config.oauth?.clientId).toBe("env-cid");
      expect(result.config.oauth?.clientSecret).toBe("env-csecret");
      // Runtime-mutable fields preserved from file
      expect(result.config.oauth?.refreshToken).toBe("file-rt");
      expect(result.config.oauth?.accessTokenExpiresAt).toBe("2026-12-31T23:59:59Z");
      expect(result.config.oauth?.scopes).toEqual(["organizations.read", "transactions.read"]);
    });

    it("ignores QONTOCTL_REFRESH_TOKEN env var entirely (issue #495)", async () => {
      await writeFile(
        join(testHome, ".qontoctl.yaml"),
        "oauth:\n  client-id: cid\n  client-secret: csecret\n  refresh-token: file-rt\n",
      );

      const result = await resolveConfig({
        home: testHome,
        env: { QONTOCTL_REFRESH_TOKEN: "env-rt-should-be-ignored" },
      });

      // env QONTOCTL_REFRESH_TOKEN is dropped entirely; file's refresh-token wins
      expect(result.config.oauth?.refreshToken).toBe("file-rt");
    });

    it("does not surface a refreshToken when only QONTOCTL_REFRESH_TOKEN is set in env (no file)", async () => {
      const result = await resolveConfig({
        home: testHome,
        env: {
          QONTOCTL_CLIENT_ID: "cid",
          QONTOCTL_CLIENT_SECRET: "csecret",
          QONTOCTL_REFRESH_TOKEN: "env-rt-should-be-ignored",
        },
      });
      // Static OAuth identity is overlaid from env...
      expect(result.config.oauth?.clientId).toBe("cid");
      expect(result.config.oauth?.clientSecret).toBe("csecret");
      // ...but refresh-token from env is dropped; resolved oauth has no refreshToken
      expect(result.config.oauth?.refreshToken).toBeUndefined();
    });
  });

  // Windows does not implement Unix file-permission bits the way POSIX
  // does — `writeFile(..., { mode })` is best-effort and stat reports a
  // synthesized 0o666/0o444 based on the read-only flag. Skip on Windows
  // so the warning behavior stays exercised on Linux + macOS where the
  // mask actually means something. The CI matrix (#477) includes a
  // POSIX leg, so coverage is preserved.
  describe.skipIf(process.platform === "win32")("permission warning (issue #479)", () => {
    it("warns on group/world-readable file containing OAuth client-secret", async () => {
      const cfgPath = join(testHome, ".qontoctl.yaml");
      await writeFile(cfgPath, "oauth:\n  client-id: cid\n  client-secret: csec\n", { mode: 0o644 });

      const result = await resolveConfig({ home: testHome, env: {} });
      expect(result.warnings.some((w) => /permissions 644/.test(w))).toBe(true);
    });

    it("does NOT warn on 0o600 file", async () => {
      const cfgPath = join(testHome, ".qontoctl.yaml");
      await writeFile(cfgPath, "oauth:\n  client-id: cid\n  client-secret: csec\n", { mode: 0o600 });

      const result = await resolveConfig({ home: testHome, env: {} });
      expect(result.warnings.every((w) => !/permissions/.test(w))).toBe(true);
    });

    it("does NOT warn on 0o644 file containing only api-key (no OAuth bearer)", async () => {
      const cfgPath = join(testHome, ".qontoctl.yaml");
      await writeFile(cfgPath, "api-key:\n  organization-slug: org\n  secret-key: x\n", { mode: 0o644 });

      const result = await resolveConfig({ home: testHome, env: {} });
      // Warning is only emitted when the loaded config contains OAuth
      // credentials. api-key files are out of scope for this warning by
      // design (the secret-key risk is conveyed via other channels).
      expect(result.warnings.every((w) => !/permissions/.test(w))).toBe(true);
    });
  });
});

describe("resolveConfigPath", () => {
  // Use platform-native path separators so the assertions hold on
  // Windows (`\`) and POSIX (`/`) alike.
  const HOME = join("home", "u");

  it("returns explicit path when provided", () => {
    expect(resolveConfigPath({ path: "/tmp/cfg.yaml" })).toBe("/tmp/cfg.yaml");
  });

  it("returns env-var value when set and no explicit path", () => {
    expect(resolveConfigPath({ env: { QONTOCTL_CONFIG_FILE: "/etc/qonto.yaml" }, home: HOME })).toBe("/etc/qonto.yaml");
  });

  it("returns profile-derived path when profile is set", () => {
    expect(resolveConfigPath({ profile: "staging", home: HOME })).toBe(join(HOME, ".qontoctl", "staging.yaml"));
  });

  it("returns home default when nothing else is set", () => {
    expect(resolveConfigPath({ home: HOME })).toBe(join(HOME, ".qontoctl.yaml"));
  });

  it("explicit path beats env-var", () => {
    expect(
      resolveConfigPath({
        path: "/from-arg.yaml",
        env: { QONTOCTL_CONFIG_FILE: "/from-env.yaml" },
        home: HOME,
      }),
    ).toBe("/from-arg.yaml");
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
