// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { applyEnvOverlay } from "./env.js";

describe("applyEnvOverlay", () => {
  it("returns config unchanged when no env vars are set", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const result = applyEnvOverlay(config, { env: {} });
    expect(result).toEqual(config);
  });

  it("overlays bare env vars without profile", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const result = applyEnvOverlay(config, {
      env: {
        QONTOCTL_ORGANIZATION_SLUG: "env-org",
        QONTOCTL_SECRET_KEY: "env-secret",
      },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "env-org",
      secretKey: "env-secret",
    });
  });

  it("partially overlays env vars", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_ORGANIZATION_SLUG: "env-org" },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "env-org",
      secretKey: "file-secret",
    });
  });

  it("overlays named profile env vars", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "staging",
      env: {
        QONTOCTL_STAGING_ORGANIZATION_SLUG: "staging-org",
        QONTOCTL_STAGING_SECRET_KEY: "staging-secret",
      },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "staging-org",
      secretKey: "staging-secret",
    });
  });

  it("normalizes hyphenated profile names to underscores", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "my-profile",
      env: {
        QONTOCTL_MY_PROFILE_ORGANIZATION_SLUG: "org",
        QONTOCTL_MY_PROFILE_SECRET_KEY: "secret",
      },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "org",
      secretKey: "secret",
    });
  });

  it("creates apiKey from env vars when config has none", () => {
    const result = applyEnvOverlay(
      {},
      {
        env: {
          QONTOCTL_ORGANIZATION_SLUG: "env-org",
          QONTOCTL_SECRET_KEY: "env-secret",
        },
      },
    );
    expect(result.apiKey).toEqual({
      organizationSlug: "env-org",
      secretKey: "env-secret",
    });
  });

  it("env var overrides file value for one field only", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_SECRET_KEY: "env-secret" },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "file-org",
      secretKey: "env-secret",
    });
  });

  it("ignores bare env vars when profile is specified", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "staging",
      env: {
        QONTOCTL_ORGANIZATION_SLUG: "bare-org",
        QONTOCTL_SECRET_KEY: "bare-secret",
      },
    });
    // With profile "staging", it looks for QONTOCTL_STAGING_* not QONTOCTL_*
    expect(result).toEqual({});
  });

  it("does not mutate the original config", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const original = structuredClone(config);
    applyEnvOverlay(config, {
      env: { QONTOCTL_ORGANIZATION_SLUG: "env-org" },
    });
    expect(config).toEqual(original);
  });
});
