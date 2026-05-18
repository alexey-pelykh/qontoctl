// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { z } from "zod";

import {
  type EndpointConfig,
  ProbeError,
  assertCatalogShape,
  diffSchema,
  suggestCorrection,
  walkKeys,
} from "./contract-probe.js";

// ---------------------------------------------------------------------------
// walkKeys — schema introspection
// ---------------------------------------------------------------------------

describe("walkKeys", () => {
  it("extracts plain string field as required-non-nullable", () => {
    const schema = z.object({ id: z.string() }).strip();
    const keys = walkKeys(schema);
    expect(keys.get("id")).toEqual({ isNullable: false, isOptional: false });
  });

  it("extracts nullable() field", () => {
    const schema = z.object({ name: z.string().nullable() }).strip();
    const keys = walkKeys(schema);
    expect(keys.get("name")).toEqual({ isNullable: true, isOptional: false });
  });

  it("extracts optional() field", () => {
    const schema = z.object({ slug: z.string().optional() }).strip();
    const keys = walkKeys(schema);
    expect(keys.get("slug")).toEqual({ isNullable: false, isOptional: true });
  });

  it("extracts nullable().optional() field (both flags)", () => {
    const schema = z.object({ attachment_id: z.string().nullable().optional() }).strip();
    const keys = walkKeys(schema);
    expect(keys.get("attachment_id")).toEqual({ isNullable: true, isOptional: true });
  });

  it("extracts optional().nullable() field (reverse order, still both)", () => {
    const schema = z.object({ x: z.string().optional().nullable() }).strip();
    const keys = walkKeys(schema);
    expect(keys.get("x")).toEqual({ isNullable: true, isOptional: true });
  });

  it("returns all keys for multi-field schema", () => {
    const schema = z
      .object({
        id: z.string(),
        name: z.string().nullable(),
        balance: z.coerce.number(),
      })
      .strip();
    const keys = walkKeys(schema);
    expect([...keys.keys()].sort()).toEqual(["balance", "id", "name"]);
  });
});

// ---------------------------------------------------------------------------
// diffSchema — runtime-vs-schema drift detection
// ---------------------------------------------------------------------------

describe("diffSchema", () => {
  const Schema = z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      attachment_id: z.string().nullable().optional(),
    })
    .strip();

  it("returns empty diff when response matches schema exactly", () => {
    const response = { id: "1", name: "X", attachment_id: "a" };
    const diff = diffSchema(Schema, response);
    expect(diff.extra_fields).toEqual([]);
    expect(diff.missing_fields).toEqual([]);
    expect(diff.strictness_mismatches).toEqual([]);
  });

  it("flags extra fields present in response but absent from schema", () => {
    const response = { id: "1", name: "X", attachment_id: null, e_invoicing_status: "ok" };
    const diff = diffSchema(Schema, response);
    expect(diff.extra_fields.map((f) => f.field)).toContain("e_invoicing_status");
    expect(diff.extra_fields[0]).toMatchObject({ field: "e_invoicing_status", observed_type: "string" });
  });

  it("flags missing fields present in schema but absent from response (when not optional)", () => {
    const response = { name: "X" }; // missing id (required), missing attachment_id (optional — should NOT flag)
    const diff = diffSchema(Schema, response);
    expect(diff.missing_fields.map((f) => f.field)).toContain("id");
    expect(diff.missing_fields.map((f) => f.field)).not.toContain("attachment_id");
  });

  it("does NOT flag missing optional fields", () => {
    const response = { id: "1", name: "X" }; // attachment_id is optional — absent is fine
    const diff = diffSchema(Schema, response);
    expect(diff.missing_fields).toEqual([]);
  });

  it("flags strictness mismatch when response has null but schema is non-nullable", () => {
    const StrictSchema = z.object({ id: z.string(), header: z.string() }).strip();
    const response = { id: "1", header: null };
    const diff = diffSchema(StrictSchema, response);
    expect(diff.strictness_mismatches.map((m) => m.field)).toContain("header");
    expect(diff.strictness_mismatches[0]).toMatchObject({
      field: "header",
      observed: "null",
      schema_strictness: "non-nullable",
    });
  });

  it("does NOT flag strictness mismatch when nullable field is null", () => {
    const response = { id: "1", name: null, attachment_id: null };
    const diff = diffSchema(Schema, response);
    expect(diff.strictness_mismatches).toEqual([]);
  });

  it("walks nested arrays — uses first element as sample for diff", () => {
    const ListSchema = z
      .object({
        items: z.array(z.object({ id: z.string(), name: z.string() }).strip()),
      })
      .strip();
    const response = { items: [{ id: "1", name: "X", extra: "field" }] };
    const diff = diffSchema(ListSchema, response);
    // Expect the nested extra field to surface with a path-qualified field name
    expect(diff.extra_fields.map((f) => f.field)).toContain("items[].extra");
  });

  it("walks nested object — qualifies path", () => {
    const NestedSchema = z
      .object({
        organization: z.object({ slug: z.string() }).strip(),
      })
      .strip();
    const response = { organization: { slug: "x", unknown_nested: "value" } };
    const diff = diffSchema(NestedSchema, response);
    expect(diff.extra_fields.map((f) => f.field)).toContain("organization.unknown_nested");
  });
});

// ---------------------------------------------------------------------------
// suggestCorrection — produces actionable Zod-declaration suggestions
// ---------------------------------------------------------------------------

describe("suggestCorrection", () => {
  it("suggests adding extra field to schema with permissive declaration", () => {
    const suggestion = suggestCorrection({
      kind: "extra_field",
      field: "e_invoicing_status",
      observed_type: "string",
      schema_name: "QuoteSchema",
    });
    expect(suggestion).toContain("QuoteSchema");
    expect(suggestion).toContain("e_invoicing_status");
    expect(suggestion).toContain("z.string()");
    // Permissive default: nullable + optional
    expect(suggestion).toContain(".nullable()");
    expect(suggestion).toContain(".optional()");
  });

  it("suggests relaxing missing field to optional", () => {
    const suggestion = suggestCorrection({
      kind: "missing_field",
      field: "header",
      schema_name: "QuoteSchema",
    });
    expect(suggestion).toContain("QuoteSchema.header");
    expect(suggestion).toContain(".optional()");
    // Must mention the "response omitted entirely" rationale
    expect(suggestion.toLowerCase()).toMatch(/omit|absent/);
  });

  it("suggests relaxing non-nullable field to nullable when response is null", () => {
    const suggestion = suggestCorrection({
      kind: "strictness_mismatch",
      field: "attachment_id",
      observed: "null",
      schema_strictness: "non-nullable",
      schema_name: "QuoteSchema",
    });
    expect(suggestion).toContain("QuoteSchema.attachment_id");
    expect(suggestion).toContain(".nullable()");
  });

  it("never produces output that would mutate schema files (suggest-only)", () => {
    const suggestion = suggestCorrection({
      kind: "extra_field",
      field: "test",
      observed_type: "string",
      schema_name: "TestSchema",
    });
    // The suggestion is a STRING (advice), never an executable instruction
    expect(typeof suggestion).toBe("string");
    expect(suggestion).not.toContain("writeFileSync");
    expect(suggestion).not.toContain("fs.write");
  });
});

// ---------------------------------------------------------------------------
// ProbeError — exit-code-carrying typed error
// ---------------------------------------------------------------------------

describe("ProbeError", () => {
  it("carries an exitCode field", () => {
    const err = new ProbeError("test", 2);
    expect(err.exitCode).toBe(2);
    expect(err.message).toBe("test");
    expect(err.name).toBe("ProbeError");
  });

  it("is an instance of Error", () => {
    const err = new ProbeError("test", 1);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof ProbeError).toBe(true);
  });

  it("supports all four exit codes (0, 1, 2, 3)", () => {
    expect(new ProbeError("clean", 0).exitCode).toBe(0);
    expect(new ProbeError("drift", 1).exitCode).toBe(1);
    expect(new ProbeError("oauth", 2).exitCode).toBe(2);
    expect(new ProbeError("config", 3).exitCode).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// assertCatalogShape — load-bearing invariants
// ---------------------------------------------------------------------------

describe("assertCatalogShape", () => {
  const okEntry: EndpointConfig = {
    id: "list-x",
    method: "GET",
    path: "/v2/x",
    schema: "XSchema",
    response_path: "x[0]",
  };

  it("accepts a non-empty GET-only catalog", () => {
    expect(() => assertCatalogShape([okEntry])).not.toThrow();
  });

  it("rejects an empty catalog with exit code 3", () => {
    try {
      assertCatalogShape([]);
      throw new Error("expected ProbeError");
    } catch (err) {
      expect(err).toBeInstanceOf(ProbeError);
      expect((err as ProbeError).exitCode).toBe(3);
      expect((err as ProbeError).message).toMatch(/zero entries/);
    }
  });

  it("rejects a POST entry with exit code 3", () => {
    const bad: EndpointConfig = { ...okEntry, method: "POST", id: "bad-post" };
    try {
      assertCatalogShape([okEntry, bad]);
      throw new Error("expected ProbeError");
    } catch (err) {
      expect(err).toBeInstanceOf(ProbeError);
      expect((err as ProbeError).exitCode).toBe(3);
      expect((err as ProbeError).message).toContain("bad-post");
      expect((err as ProbeError).message).toContain("POST");
      expect((err as ProbeError).message).toMatch(/GET-only/);
    }
  });

  it("rejects PUT/PATCH/DELETE entries", () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const bad: EndpointConfig = { ...okEntry, method };
      expect(() => assertCatalogShape([bad])).toThrow(ProbeError);
    }
  });
});
