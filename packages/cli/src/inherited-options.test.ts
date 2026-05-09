// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { Command, Option } from "commander";
import { addInheritableOptions, buildResolveOptions, resolveGlobalOptions } from "./inherited-options.js";

describe("addInheritableOptions", () => {
  it("adds --config, --profile, --verbose, --debug, and --sca-method to a command", () => {
    const cmd = new Command("test");
    addInheritableOptions(cmd);

    const optionNames = cmd.options.map((o) => o.long);
    expect(optionNames).toContain("--config");
    expect(optionNames).toContain("--profile");
    expect(optionNames).toContain("--verbose");
    expect(optionNames).toContain("--debug");
    expect(optionNames).toContain("--sca-method");
  });

  it("adds -p as shorthand for --profile", () => {
    const cmd = new Command("test");
    addInheritableOptions(cmd);

    const profileOption = cmd.options.find((o) => o.long === "--profile");
    expect(profileOption?.short).toBe("-p");
  });

  it("hides --sca-method from help", () => {
    const cmd = new Command("test");
    addInheritableOptions(cmd);

    const scaOption = cmd.options.find((o) => o.long === "--sca-method");
    expect(scaOption?.hidden).toBe(true);
  });

  it("does NOT hide --config from help (visible flag)", () => {
    const cmd = new Command("test");
    addInheritableOptions(cmd);

    const configOption = cmd.options.find((o) => o.long === "--config");
    expect(configOption?.hidden).toBeFalsy();
  });
});

describe("resolveGlobalOptions", () => {
  function createProgram(): Command {
    const program = new Command();
    program
      .addOption(new Option("--config <path>", "config file path"))
      .addOption(new Option("-p, --profile <name>", "configuration profile"))
      .addOption(new Option("-o, --output <format>", "output format").default("table"))
      .addOption(new Option("--verbose", "verbose output"))
      .addOption(new Option("--debug", "debug output"));
    return program;
  }

  it("resolves profile from global position", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "--profile", "work", "sub"]);
    expect(resolved["profile"]).toBe("work");
  });

  it("resolves profile from subcommand position", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "sub", "--profile", "work"]);
    expect(resolved["profile"]).toBe("work");
  });

  it("gives subcommand-level profile precedence over global", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "--profile", "global", "sub", "--profile", "local"]);
    expect(resolved["profile"]).toBe("local");
  });

  it("inherits output default from parent when not set on subcommand", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "sub"]);
    expect(resolved["output"]).toBe("table");
  });

  it("resolves verbose from subcommand position", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "sub", "--verbose"]);
    expect(resolved["verbose"]).toBe(true);
  });

  it("resolves debug from subcommand position", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "sub", "--debug"]);
    expect(resolved["debug"]).toBe(true);
  });

  it("works with deeply nested commands", async () => {
    const program = createProgram();
    const group = program.command("group");
    const sub = group.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "group", "sub", "--profile", "deep"]);
    expect(resolved["profile"]).toBe("deep");
  });

  it("resolves --config from global position", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "--config", "/path/to/config.yaml", "sub"]);
    expect(resolved["config"]).toBe("/path/to/config.yaml");
  });

  it("resolves --config from subcommand position", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "sub", "--config", "/path/to/config.yaml"]);
    expect(resolved["config"]).toBe("/path/to/config.yaml");
  });

  it("gives subcommand-level --config precedence over global", async () => {
    const program = createProgram();
    const sub = program.command("sub");
    addInheritableOptions(sub);

    let resolved: Record<string, unknown> = {};
    sub.action((_opts: unknown, cmd: Command) => {
      resolved = resolveGlobalOptions(cmd);
    });

    await program.parseAsync(["node", "test", "--config", "/global.yaml", "sub", "--config", "/local.yaml"]);
    expect(resolved["config"]).toBe("/local.yaml");
  });
});

describe("buildResolveOptions", () => {
  class StreamCapture {
    chunks: string[] = [];
    write(chunk: string): boolean {
      this.chunks.push(chunk);
      return true;
    }
  }

  it("returns empty when neither --config nor --profile is set", () => {
    const stderr = new StreamCapture();
    const result = buildResolveOptions({}, { stderr: stderr as unknown as NodeJS.WritableStream });
    expect(result).toEqual({});
    expect(stderr.chunks).toEqual([]);
  });

  it("returns { profile } when only --profile is set", () => {
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { profile: "work" },
      { home: "/home/user", env: {}, stderr: stderr as unknown as NodeJS.WritableStream },
    );
    expect(result).toEqual({ profile: "work" });
    expect(stderr.chunks).toEqual([]);
  });

  it("returns { path } when only --config is set", () => {
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { config: "/explicit/config.yaml" },
      { home: "/home/user", env: {}, stderr: stderr as unknown as NodeJS.WritableStream },
    );
    expect(result).toEqual({ path: "/explicit/config.yaml" });
    expect(stderr.chunks).toEqual([]);
  });

  it('treats --config "" (empty string) as if --config were not supplied', () => {
    // Defensive guard: `--config "$UNSET_VAR"` from a shell evaluates to
    // `--config ""`. Without this handling, `path.resolve("")` returns CWD,
    // which would silently re-introduce CWD-based config discovery (removed
    // by #479/#480).
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { config: "" },
      { home: "/home/user", env: {}, stderr: stderr as unknown as NodeJS.WritableStream },
    );
    expect(result).toEqual({});
    expect(stderr.chunks).toEqual([]);
  });

  it('treats --config "" alongside --profile as just --profile', () => {
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { config: "", profile: "work" },
      { home: "/home/user", env: {}, stderr: stderr as unknown as NodeJS.WritableStream },
    );
    expect(result).toEqual({ profile: "work" });
    expect(stderr.chunks).toEqual([]);
  });

  it("warns and returns { path } when --config differs from QONTOCTL_CONFIG_FILE env", () => {
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { config: "/explicit/config.yaml" },
      {
        home: "/home/user",
        env: { QONTOCTL_CONFIG_FILE: "/from-env.yaml" },
        stderr: stderr as unknown as NodeJS.WritableStream,
      },
    );
    expect(result).toEqual({ path: "/explicit/config.yaml" });
    expect(stderr.chunks).toHaveLength(1);
    expect(stderr.chunks[0]).toContain("--config");
    expect(stderr.chunks[0]).toContain("QONTOCTL_CONFIG_FILE");
    expect(stderr.chunks[0]).toContain("/from-env.yaml");
  });

  it("does NOT warn when --config matches QONTOCTL_CONFIG_FILE env", () => {
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { config: "/same/path.yaml" },
      {
        home: "/home/user",
        env: { QONTOCTL_CONFIG_FILE: "/same/path.yaml" },
        stderr: stderr as unknown as NodeJS.WritableStream,
      },
    );
    expect(result).toEqual({ path: "/same/path.yaml" });
    expect(stderr.chunks).toEqual([]);
  });

  it("ignores empty QONTOCTL_CONFIG_FILE env (no warning)", () => {
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { config: "/explicit/config.yaml" },
      {
        home: "/home/user",
        env: { QONTOCTL_CONFIG_FILE: "" },
        stderr: stderr as unknown as NodeJS.WritableStream,
      },
    );
    expect(result).toEqual({ path: "/explicit/config.yaml" });
    expect(stderr.chunks).toEqual([]);
  });

  it("warns and returns { path, profile } when --config differs from --profile-derived path", () => {
    // Profile is preserved so QONTOCTL_<PROFILE>_* env overrides continue to apply
    // and core's resolveConfig validates the profile name. --config wins for FILE
    // selection only, not for the entire profile semantics.
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { config: "/explicit/config.yaml", profile: "work" },
      { home: "/home/user", env: {}, stderr: stderr as unknown as NodeJS.WritableStream },
    );
    expect(result).toEqual({ path: "/explicit/config.yaml", profile: "work" });
    expect(stderr.chunks).toHaveLength(1);
    expect(stderr.chunks[0]).toContain("--config");
    expect(stderr.chunks[0]).toContain("--profile");
    expect(stderr.chunks[0]).toContain("work");
    // Warning text mentions the env-prefix preservation so users aren't surprised
    expect(stderr.chunks[0]).toContain("QONTOCTL_WORK_*");
  });

  it("does NOT warn when --config matches --profile-derived path", () => {
    // Path matches — no warning. Profile is still preserved so env-prefix applies.
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { config: "/home/user/.qontoctl/work.yaml", profile: "work" },
      { home: "/home/user", env: {}, stderr: stderr as unknown as NodeJS.WritableStream },
    );
    expect(result).toEqual({ path: "/home/user/.qontoctl/work.yaml", profile: "work" });
    expect(stderr.chunks).toEqual([]);
  });

  it("emits both warnings when --config conflicts with both env and --profile", () => {
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { config: "/explicit/config.yaml", profile: "work" },
      {
        home: "/home/user",
        env: { QONTOCTL_CONFIG_FILE: "/from-env.yaml" },
        stderr: stderr as unknown as NodeJS.WritableStream,
      },
    );
    expect(result).toEqual({ path: "/explicit/config.yaml", profile: "work" });
    expect(stderr.chunks).toHaveLength(2);
    expect(stderr.chunks.some((c) => c.includes("QONTOCTL_CONFIG_FILE"))).toBe(true);
    expect(stderr.chunks.some((c) => c.includes("--profile"))).toBe(true);
  });

  it("preserves profile-with-hyphens correctly in warning text (env-var name normalization)", () => {
    // Profile name "my-work" becomes "QONTOCTL_MY_WORK_*" in env-var prefix
    // (hyphens replaced with underscores per core's prefix convention).
    const stderr = new StreamCapture();
    const result = buildResolveOptions(
      { config: "/explicit/config.yaml", profile: "my-work" },
      { home: "/home/user", env: {}, stderr: stderr as unknown as NodeJS.WritableStream },
    );
    expect(result).toEqual({ path: "/explicit/config.yaml", profile: "my-work" });
    expect(stderr.chunks[0]).toContain("QONTOCTL_MY_WORK_*");
  });

  it("compares paths in resolved (absolute) form, not literal", () => {
    // If --config is relative and resolves to the same absolute path as the env, no warning.
    const stderr = new StreamCapture();
    const cwd = process.cwd();
    const result = buildResolveOptions(
      { config: "./config.yaml" },
      {
        home: "/home/user",
        env: { QONTOCTL_CONFIG_FILE: `${cwd}/config.yaml` },
        stderr: stderr as unknown as NodeJS.WritableStream,
      },
    );
    expect(result).toEqual({ path: "./config.yaml" });
    expect(stderr.chunks).toEqual([]);
  });
});
