// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, afterEach } from "vitest";
import { buildMcpResolveOptions } from "./config.js";

describe("buildMcpResolveOptions", () => {
  describe("with explicit env argument", () => {
    it("returns undefined when QONTOCTL_CONFIG_FILE is absent", () => {
      expect(buildMcpResolveOptions({})).toBeUndefined();
    });

    it("returns undefined when QONTOCTL_CONFIG_FILE is empty string", () => {
      // Defensive guard: `QONTOCTL_CONFIG_FILE="$UNSET_VAR"` from a shell
      // evaluates to an empty string. Without this handling, callers would
      // silently treat "" as a valid path.
      expect(buildMcpResolveOptions({ QONTOCTL_CONFIG_FILE: "" })).toBeUndefined();
    });

    it("returns { path } when QONTOCTL_CONFIG_FILE is set to an absolute path", () => {
      expect(buildMcpResolveOptions({ QONTOCTL_CONFIG_FILE: "/etc/qontoctl.yaml" })).toEqual({
        path: "/etc/qontoctl.yaml",
      });
    });

    it("returns { path } when QONTOCTL_CONFIG_FILE is set to a relative path", () => {
      // Relative paths are passed through verbatim — core's resolver
      // handles normalization.
      expect(buildMcpResolveOptions({ QONTOCTL_CONFIG_FILE: "./local.yaml" })).toEqual({ path: "./local.yaml" });
    });

    it("ignores other QONTOCTL_* env vars", () => {
      // Only QONTOCTL_CONFIG_FILE is consulted by this helper. Other
      // QONTOCTL_* vars are processed downstream by core's env overlay.
      expect(
        buildMcpResolveOptions({
          QONTOCTL_ORGANIZATION_SLUG: "acme",
          QONTOCTL_SECRET_KEY: "secret",
        }),
      ).toBeUndefined();
    });
  });

  describe("falling back to process.env", () => {
    const ORIGINAL = process.env["QONTOCTL_CONFIG_FILE"];

    afterEach(() => {
      if (ORIGINAL === undefined) {
        delete process.env["QONTOCTL_CONFIG_FILE"];
      } else {
        process.env["QONTOCTL_CONFIG_FILE"] = ORIGINAL;
      }
    });

    it("reads from process.env when env argument is omitted", () => {
      process.env["QONTOCTL_CONFIG_FILE"] = "/from/process/env.yaml";
      expect(buildMcpResolveOptions()).toEqual({ path: "/from/process/env.yaml" });
    });

    it("returns undefined when process.env QONTOCTL_CONFIG_FILE is unset", () => {
      delete process.env["QONTOCTL_CONFIG_FILE"];
      expect(buildMcpResolveOptions()).toBeUndefined();
    });
  });
});
