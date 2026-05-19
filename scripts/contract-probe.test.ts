// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { BeneficiarySchema, ClientInvoiceSchema, QuoteSchema } from "@qontoctl/core";
import { describe, it, expect } from "vitest";
import { z } from "zod";

import {
  type EndpointConfig,
  ProbeError,
  assertCatalogShape,
  diffSchema,
  suggestCorrection,
  unwrapToObject,
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

// ---------------------------------------------------------------------------
// walkKeys — composite-wrapper regressions (#616)
//
// The probe's first production run (v2.0.2 release prep) emitted 6 false
// positives because walkKeys only unwrapped ZodOptional / ZodNullable. When
// the OUTERMOST wrapper is ZodDefault (`.default(null)`) or ZodPipe
// (`.transform()`), the unwrap loop short-circuited and isNullable/isOptional
// stayed false. These tests pin the three affected patterns.
// ---------------------------------------------------------------------------

describe("walkKeys — composite-wrapper regressions (#616)", () => {
  // REQ-A1: z.<T>().nullable().optional().default(null) — accepts null AND absent.
  it("REQ-A1: nullable().optional().default(null) is nullable + optional", () => {
    const schema = z.object({ f: z.string().nullable().optional().default(null) }).strip();
    expect(walkKeys(schema).get("f")).toEqual({ isNullable: true, isOptional: true });
  });

  // REQ-A1: default() alone makes a field accept absence (acceptsAbsent).
  it("REQ-A1: a bare .default() makes the field optional (accepts absence)", () => {
    const schema = z.object({ f: z.string().default("x") }).strip();
    expect(walkKeys(schema).get("f")).toEqual({ isNullable: false, isOptional: true });
  });

  // REQ-A2: wrapper-form z.nullable(z.<T>()) is equivalent to chained .nullable().
  it("REQ-A2: z.nullable(z.string()) wrapper-form == chained z.string().nullable()", () => {
    const wrapper = walkKeys(z.object({ f: z.nullable(z.string()) }).strip()).get("f");
    const chained = walkKeys(z.object({ f: z.string().nullable() }).strip()).get("f");
    expect(wrapper).toEqual(chained);
    expect(wrapper).toEqual({ isNullable: true, isOptional: false });
  });

  // REQ-A2 + REQ-A1 combined: the exact BeneficiarySchema.email declaration shape.
  it("REQ-A2: z.nullable(z.string()).optional().default(null) is nullable + optional", () => {
    const schema = z.object({ email: z.nullable(z.string()).optional().default(null) }).strip();
    expect(walkKeys(schema).get("email")).toEqual({ isNullable: true, isOptional: true });
  });

  // REQ-A3: a .transform() following .nullable() must preserve upstream nullability.
  it("REQ-A3: z.array(...).nullable().transform(...) preserves nullability", () => {
    const schema = z
      .object({
        items: z
          .array(z.object({ id: z.string() }).strip())
          .nullable()
          .transform((v) => v ?? []),
      })
      .strip();
    expect(walkKeys(schema).get("items")).toMatchObject({ isNullable: true });
  });

  // BUT NOT (issue constraint #2): real drift must still be flagged — the
  // unwrap fix must not silence a genuinely non-nullable field that is null.
  it("BUT NOT: a genuinely non-nullable field is still flagged when null", () => {
    const schema = z.object({ id: z.string(), header: z.string() }).strip();
    const diff = diffSchema(schema, { id: "1", header: null });
    expect(diff.strictness_mismatches.map((m) => m.field)).toContain("header");
  });

  // BUT NOT: a genuinely required field is still flagged when absent, even
  // alongside default()-wrapped siblings that must NOT be flagged.
  it("BUT NOT: a required field is still flagged missing next to default() siblings", () => {
    const schema = z.object({ id: z.string(), opt: z.string().nullable().optional().default(null) }).strip();
    const diff = diffSchema(schema, { opt: null });
    expect(diff.missing_fields.map((m) => m.field)).toContain("id");
    expect(diff.missing_fields.map((m) => m.field)).not.toContain("opt");
    expect(diff.strictness_mismatches.map((m) => m.field)).not.toContain("opt");
  });
});

// ---------------------------------------------------------------------------
// diffSchema — production-schema regression for the 6 reported false
// positives (probe report .tmp/contract-probe/2026-05-18T12-30-04-316Z.json).
// Exercises the REAL @qontoctl/core schemas + the REAL probe unwrap path
// (unwrapToObject → diffSchema), per BUT NOT #3 (no mocking introspection).
// ---------------------------------------------------------------------------

describe("diffSchema — #616 production-schema false-positive regression", () => {
  it("BeneficiarySchema: email:null is clean (probe finding: list-beneficiaries)", () => {
    const schema = unwrapToObject(BeneficiarySchema as unknown as z.ZodType);
    expect(schema).not.toBeNull();
    const diff = diffSchema(schema!, {
      id: "ben_1",
      name: "Acme Ltd",
      iban: "FR7630006000011234567890189",
      bic: null,
      email: null,
      activity_tag: null,
      status: "validated",
      trusted: true,
      created_at: "2026-05-18T00:00:00.000Z",
      updated_at: "2026-05-18T00:00:00.000Z",
    });
    expect(diff.strictness_mismatches.map((m) => m.field)).not.toContain("email");
    expect(diff.strictness_mismatches.map((m) => m.field)).not.toContain("bic");
    expect(diff.strictness_mismatches.map((m) => m.field)).not.toContain("activity_tag");
    expect(diff.missing_fields.map((m) => m.field)).not.toContain("email");
  });

  it("QuoteSchema: discount + client.* absent are clean (probe finding: list-quotes)", () => {
    const schema = unwrapToObject(QuoteSchema as unknown as z.ZodType);
    expect(schema).not.toBeNull();
    // Runtime shape from the probe report: discount omitted entirely; nested
    // client omits province_code / recipient_code / delivery_address.
    const diff = diffSchema(schema!, {
      id: "quote_1",
      organization_id: "org_1",
      number: "Q-1",
      status: "approved",
      currency: "EUR",
      total_amount: { value: "10.00", currency: "EUR" },
      total_amount_cents: 1000,
      vat_amount: { value: "0.00", currency: "EUR" },
      vat_amount_cents: 0,
      issue_date: "2026-05-18",
      expiry_date: "2026-06-18",
      created_at: "2026-05-18T00:00:00.000Z",
      items: [],
      client: { id: "client_1", name: "Acme", type: "company", email: "a@b.co" },
    });
    for (const f of ["discount", "client.province_code", "client.recipient_code", "client.delivery_address"]) {
      expect(diff.missing_fields.map((m) => m.field)).not.toContain(f);
    }
  });

  it("ClientInvoiceSchema: items:null is clean (probe finding: list-client-invoices)", () => {
    const schema = unwrapToObject(ClientInvoiceSchema as unknown as z.ZodType);
    expect(schema).not.toBeNull();
    const diff = diffSchema(schema!, {
      id: "ci_1",
      number: "INV-1",
      status: "draft",
      currency: "EUR",
      due_date: null,
      created_at: "2026-05-18T00:00:00.000Z",
      updated_at: "2026-05-18T00:00:00.000Z",
      contact_email: null,
      terms_and_conditions: null,
      header: null,
      footer: null,
      items: null,
      client: { id: "client_1", name: "Acme" },
    });
    expect(diff.strictness_mismatches.map((m) => m.field)).not.toContain("items");
    expect(diff.missing_fields.map((m) => m.field)).not.toContain("items");
  });
});

// ---------------------------------------------------------------------------
// unwrapToObject + unwrapForDescent — ZodDefault wrapper regressions (#620)
//
// Scope-Lock SL-1 of #616: the two non-walkKeys unwrap helpers also short-
// circuit on a ZodDefault wrapper. `unwrapToObject` (top-level) refused to
// resolve a `z.object({...}).default({...})` schema; `unwrapForDescent`
// (nested-descent) returned the ZodDefault wrapper, which is neither ZodObject
// nor ZodArray — so walkDiff treated the field as a leaf and never surfaced
// drift inside the wrapped subtree. Both paths now mirror the #616 walkKeys
// fix: capped iteration with an explicit ZodDefault branch that descends
// `_zod.def.innerType`. Real introspection only, no mocks (#616 REQ-A5
// discipline, also reasserted as a BUT-NOT here).
// ---------------------------------------------------------------------------

describe("unwrapToObject — ZodDefault top-level regression (#620)", () => {
  // REQ-B1: a top-level `.default({...})` wrapper must resolve to its inner
  // ZodObject. Pre-fix, the loop exhausted 16 iterations and returned null
  // because ZodDefault exposes neither ZodOptional/Nullable nor `def.out`.
  it("REQ-B1: descends a top-level .default({...}) wrapper to its inner ZodObject", () => {
    const schema = z.object({ id: z.string() }).strip().default({ id: "" });
    const unwrapped = unwrapToObject(schema as unknown as z.ZodType);
    expect(unwrapped).not.toBeNull();
    expect(unwrapped).toBeInstanceOf(z.ZodObject);
    expect(walkKeys(unwrapped!).get("id")).toEqual({ isNullable: false, isOptional: false });
  });

  // REQ-B1: ZodDefault stacked with ZodOptional / ZodNullable must still resolve.
  it("REQ-B1: descends .optional().nullable().default({...}) stacked wrappers", () => {
    const schema = z.object({ id: z.string() }).strip().optional().nullable().default({ id: "" });
    const unwrapped = unwrapToObject(schema as unknown as z.ZodType);
    expect(unwrapped).not.toBeNull();
    expect(walkKeys(unwrapped!).has("id")).toBe(true);
  });

  // BUT NOT: unwrapToObject only resolves to ZodObject. A top-level
  // `.default([...])` over a ZodArray descends through ZodDefault to ZodArray,
  // which is not ZodObject — the fall-through still returns null (the probe's
  // documented contract: object-shaped schemas only).
  it("BUT NOT: returns null for a top-level .default([...]) over a ZodArray", () => {
    const schema = z.array(z.string()).default([]);
    expect(unwrapToObject(schema as unknown as z.ZodType)).toBeNull();
  });
});

describe("unwrapForDescent — ZodDefault nested-descent regression (#620)", () => {
  // REQ-B2: a nested `.default({...})`-wrapped object must have its keys
  // walked. Without the fix, diffSchema would silently treat `config` as a
  // leaf and miss the nested `unknown_nested` extra field (false-negative
  // drift — the symmetric counterpart to the #616 false-positive class).
  it("REQ-B2: diffSchema surfaces extras inside a .default({...})-wrapped nested object", () => {
    const schema = z
      .object({
        config: z.object({ x: z.string() }).strip().default({ x: "" }),
      })
      .strip();
    const diff = diffSchema(schema, { config: { x: "ok", unknown_nested: "val" } });
    expect(diff.extra_fields.map((f) => f.field)).toContain("config.unknown_nested");
  });

  // REQ-B2: same drift visibility for a `.default([...])`-wrapped nested array.
  // `unwrapForDescent` accepts arrays as descent targets (unlike unwrapToObject),
  // so an element-level extra must surface with the `items[].field` path.
  it("REQ-B2: diffSchema surfaces extras inside a .default([...])-wrapped nested array", () => {
    const schema = z
      .object({
        items: z.array(z.object({ id: z.string() }).strip()).default([]),
      })
      .strip();
    const diff = diffSchema(schema, { items: [{ id: "1", extra: "val" }] });
    expect(diff.extra_fields.map((f) => f.field)).toContain("items[].extra");
  });

  // BUT NOT: genuine missing-required drift inside a `.default({...})`-wrapped
  // nested object is still flagged. The fix must restore visibility into the
  // wrapped subtree without silencing legitimate findings.
  it("BUT NOT: missing required field inside .default({...})-wrapped nested object is still flagged", () => {
    const schema = z
      .object({
        config: z.object({ required: z.string(), opt: z.string().optional() }).strip().default({ required: "" }),
      })
      .strip();
    const diff = diffSchema(schema, { config: {} });
    expect(diff.missing_fields.map((m) => m.field)).toContain("config.required");
  });
});

// ---------------------------------------------------------------------------
// walkKeys + unwrap helpers — ZodReadonly wrapper regressions (#622)
//
// Same wrapper-short-circuit class as #616 / #620, but for `ZodReadonly`.
// `.readonly()` affects only mutability — it does NOT change null/absence
// acceptance. But because none of the existing branches in walkKeys /
// unwrapForDescent / unwrapToObject match `ZodReadonly`, the loop short-
// circuits on entry whenever ZodReadonly is the outermost wrapper, or when
// ZodReadonly is sandwiched between an outer and inner strictness wrapper.
//
// Empirically zero false positives today (QuoteSchema.items and .invoice_ids
// happen to not stack nullability inside `.readonly()`), but a future
// declaration like `z.array(...).nullable().readonly()` would silently drop
// the upstream `.nullable()`. Fix the latent gap before it lands.
//
// Real introspection only, no mocks (#616 REQ-A5 discipline reasserted).
// ---------------------------------------------------------------------------

describe("walkKeys — ZodReadonly wrapper regressions (#622)", () => {
  // REQ-C1: bare `.readonly()` on a non-strictness inner type — no flag
  // change. Mirrors QuoteSchema.items shape. Accidentally correct pre-fix
  // (the break short-circuit happens to produce `{false, false}` which is
  // the right answer when the inner type carries no strictness), but pinned
  // so a future refactor can't regress it.
  it("REQ-C1: z.array(...).readonly() is non-nullable + required", () => {
    const schema = z.object({ items: z.array(z.string()).readonly() }).strip();
    expect(walkKeys(schema).get("items")).toEqual({ isNullable: false, isOptional: false });
  });

  // REQ-C1: `.readonly().optional()` — `.optional()` outer wraps `.readonly()`.
  // Mirrors QuoteSchema.invoice_ids shape. Pre-fix the loop unwraps `.optional()`
  // (isOptional=true), descends to ZodReadonly, then breaks — accidentally
  // correct because the inner type carries no nullability.
  it("REQ-C1: z.array(...).readonly().optional() is required-optional, non-nullable", () => {
    const schema = z.object({ invoice_ids: z.array(z.string()).readonly().optional() }).strip();
    expect(walkKeys(schema).get("invoice_ids")).toEqual({ isNullable: false, isOptional: true });
  });

  // REQ-C1: `.nullable().readonly()` — readonly is OUTERMOST, wraps nullable.
  // Pre-fix: loop enters, ZodReadonly doesn't match any branch → `break` on
  // entry → both flags stay false → WRONG. The inner `.nullable()` is lost.
  // This is the canonical latent failure case the issue describes.
  it("REQ-C1: z.array(...).nullable().readonly() preserves nullability through outer readonly", () => {
    const schema = z.object({ items: z.array(z.string()).nullable().readonly() }).strip();
    expect(walkKeys(schema).get("items")).toEqual({ isNullable: true, isOptional: false });
  });

  // REQ-C1: `.readonly().nullable()` — nullable is OUTERMOST. Pre-fix: loop
  // unwraps `.nullable()` (isNullable=true), descends to ZodReadonly, then
  // breaks → accidentally correct. Pinned to guard against the fix breaking
  // the working order.
  it("REQ-C1: z.array(...).readonly().nullable() is nullable", () => {
    const schema = z.object({ items: z.array(z.string()).readonly().nullable() }).strip();
    expect(walkKeys(schema).get("items")).toEqual({ isNullable: true, isOptional: false });
  });

  // REQ-C1: `.nullable().readonly().optional()` — readonly is sandwiched.
  // Pre-fix: loop unwraps `.optional()` (isOptional=true), descends to
  // ZodReadonly, then breaks → upstream `.nullable()` is LOST → WRONG. Post-
  // fix: descends through ZodReadonly to reach the inner `.nullable()`.
  it("REQ-C1: z.array(...).nullable().readonly().optional() is nullable + optional", () => {
    const schema = z.object({ items: z.array(z.string()).nullable().readonly().optional() }).strip();
    expect(walkKeys(schema).get("items")).toEqual({ isNullable: true, isOptional: true });
  });

  // REQ-C1: real `QuoteSchema.items` and `.invoice_ids` — pin the observed-
  // production shapes. Both happen to be accidentally-correct pre-fix; this
  // is a status-quo regression guard, not a RED test.
  it("REQ-C1: real QuoteSchema.items shape produces the expected flags", () => {
    const schema = unwrapToObject(QuoteSchema as unknown as z.ZodType);
    expect(schema).not.toBeNull();
    expect(walkKeys(schema!).get("items")).toEqual({ isNullable: false, isOptional: false });
  });

  it("REQ-C1: real QuoteSchema.invoice_ids shape produces the expected flags", () => {
    const schema = unwrapToObject(QuoteSchema as unknown as z.ZodType);
    expect(schema).not.toBeNull();
    expect(walkKeys(schema!).get("invoice_ids")).toEqual({ isNullable: false, isOptional: true });
  });

  // BUT NOT: a genuinely non-nullable readonly array that returns null is
  // still flagged as a strictness mismatch. The fix must not silence drift —
  // `.readonly()` is mutability-only, so `z.array(...).readonly()` is still
  // non-nullable.
  it("BUT NOT: a non-nullable z.array(...).readonly() field returning null is still flagged", () => {
    const schema = z.object({ items: z.array(z.string()).readonly() }).strip();
    const diff = diffSchema(schema, { items: null });
    expect(diff.strictness_mismatches.map((m) => m.field)).toContain("items");
  });
});

describe("unwrapToObject — ZodReadonly top-level regression (#622)", () => {
  // REQ-C2: a top-level `.readonly()` wrapper must resolve to its inner
  // ZodObject. Pre-fix: ZodReadonly matches none of the branches, `def.out`
  // doesn't exist → returns null → the probe would refuse a hypothetical
  // `z.object({...}).readonly()` schema reference even though it is object-
  // shaped. No production schema uses this shape today, but the helper-
  // parity gap is what the issue's SL-1 audit asks us to close.
  it("REQ-C2: descends a top-level .readonly() wrapper to its inner ZodObject", () => {
    const schema = z.object({ id: z.string() }).strip().readonly();
    const unwrapped = unwrapToObject(schema as unknown as z.ZodType);
    expect(unwrapped).not.toBeNull();
    expect(unwrapped).toBeInstanceOf(z.ZodObject);
    expect(walkKeys(unwrapped!).get("id")).toEqual({ isNullable: false, isOptional: false });
  });

  // REQ-C2: ZodReadonly stacked with ZodOptional / ZodNullable / ZodDefault
  // must still resolve.
  it("REQ-C2: descends .optional().nullable().readonly() stacked wrappers", () => {
    const schema = z.object({ id: z.string() }).strip().optional().nullable().readonly();
    const unwrapped = unwrapToObject(schema as unknown as z.ZodType);
    expect(unwrapped).not.toBeNull();
    expect(walkKeys(unwrapped!).has("id")).toBe(true);
  });

  // BUT NOT: unwrapToObject only resolves to ZodObject. A top-level
  // `.readonly()` over a ZodArray descends through ZodReadonly to ZodArray,
  // which is not ZodObject — the fall-through still returns null (the
  // probe's documented object-shaped-only contract).
  it("BUT NOT: returns null for a top-level z.array(...).readonly()", () => {
    const schema = z.array(z.string()).readonly();
    expect(unwrapToObject(schema as unknown as z.ZodType)).toBeNull();
  });
});

describe("unwrapForDescent — ZodReadonly nested-descent regression (#622)", () => {
  // REQ-C3: a nested `.readonly()`-wrapped object must have its keys walked.
  // Without the fix, diffSchema would silently treat `config` as a leaf and
  // miss the nested `unknown_nested` extra field (false-negative drift —
  // the same symmetric counterpart to #616 that #620 fixed for ZodDefault).
  it("REQ-C3: diffSchema surfaces extras inside a .readonly()-wrapped nested object", () => {
    const schema = z
      .object({
        config: z.object({ x: z.string() }).strip().readonly(),
      })
      .strip();
    const diff = diffSchema(schema, { config: { x: "ok", unknown_nested: "val" } });
    expect(diff.extra_fields.map((f) => f.field)).toContain("config.unknown_nested");
  });

  // REQ-C3: same drift visibility for a `.readonly()`-wrapped nested array.
  // Mirrors QuoteSchema.items shape: extras inside QuoteItemSchema elements
  // would be silently invisible pre-fix.
  it("REQ-C3: diffSchema surfaces extras inside a z.array(...).readonly() nested array", () => {
    const schema = z
      .object({
        items: z.array(z.object({ id: z.string() }).strip()).readonly(),
      })
      .strip();
    const diff = diffSchema(schema, { items: [{ id: "1", extra: "val" }] });
    expect(diff.extra_fields.map((f) => f.field)).toContain("items[].extra");
  });

  // BUT NOT: genuine missing-required drift inside a `.readonly()`-wrapped
  // nested object is still flagged. The fix must restore visibility into
  // the wrapped subtree without silencing legitimate findings.
  it("BUT NOT: missing required field inside .readonly()-wrapped nested object is still flagged", () => {
    const schema = z
      .object({
        config: z.object({ required: z.string(), opt: z.string().optional() }).strip().readonly(),
      })
      .strip();
    const diff = diffSchema(schema, { config: {} });
    expect(diff.missing_fields.map((m) => m.field)).toContain("config.required");
  });
});

// ---------------------------------------------------------------------------
// walkKeys + unwrap helpers — ZodPipe direction regressions (#623)
//
// Same wrapper-short-circuit class as #616 / #622, but for the *direction*
// inside `ZodPipe`. PR #619 made `walkKeys` descend `def.in` because
// `.transform(fn)` produces `ZodPipe { in: source, out: ZodTransform }`. That
// is correct for `.transform()` but inverted for `z.preprocess(fn, target)`
// which produces `ZodPipe { in: ZodTransform, out: target }` — the target
// (which carries any `.nullable()` / `.optional()`) lives on `def.out`. With
// the #619-era code, a field declared `z.preprocess(fn, z.string().nullable())`
// would land on ZodTransform inside `walkKeys` and short-circuit the loop,
// dropping the inner `.nullable()` and emitting a false-positive
// `strictness_mismatch` for a genuinely-nullable preprocessed field.
//
// Empirically zero false positives today (no current @qontoctl/core schema
// uses field-level `z.preprocess`), but the same wrapper-short-circuit class
// as #616 / #620 / #622 — fix the latent gap before it lands. Audit also
// extends to `unwrapForDescent` (pre-fix descended `def.out` unconditionally
// → landed on ZodTransform for `.transform()` → falls through as leaf →
// skipped nested-element drift inside `ClientInvoiceSchema.items`-shaped
// fields) and `unwrapToObject` (pre-fix tried `def.out` first, but ZodTransform
// IS a ZodType → entered the wrong side → exhausted the 16-step budget →
// returned `null`, refusing a top-level `z.object({...}).transform(fn)`).
//
// Real introspection only, no mocks (#616 REQ-A5 discipline reasserted).
// ---------------------------------------------------------------------------

describe("walkKeys — ZodPipe direction regressions (#623)", () => {
  // REQ-D1: `z.preprocess(fn, z.string().nullable())` — preprocess is the
  // canonical RED case. Pre-fix: walkKeys descended def.in (ZodTransform) →
  // loop short-circuits → both flags false → WRONG. Post-fix: detects
  // ZodTransform on def.in → descends def.out → reaches `.nullable()`.
  it("REQ-D1: z.preprocess(fn, z.string().nullable()) is nullable", () => {
    const schema = z
      .object({
        f: z.preprocess((v) => v, z.string().nullable()),
      })
      .strip();
    expect(walkKeys(schema).get("f")).toEqual({ isNullable: true, isOptional: false });
  });

  // REQ-D1: `z.preprocess(fn, z.string().optional().default(null))` — both
  // strictness flags must propagate through the preprocess target side.
  it("REQ-D1: z.preprocess(fn, z.string().nullable().optional().default(null)) is nullable + optional", () => {
    const schema = z
      .object({
        f: z.preprocess((v) => v, z.string().nullable().optional().default(null)),
      })
      .strip();
    expect(walkKeys(schema).get("f")).toEqual({ isNullable: true, isOptional: true });
  });

  // REQ-D1 regression guard: `.transform()` direction (the #619 case) must
  // still work post-fix. Direction selection picks def.in when def.out is
  // ZodTransform, mirroring the original PR #619 behavior.
  it("REQ-D1 regression: z.array(...).nullable().transform(...) still preserves nullability", () => {
    const schema = z
      .object({
        items: z
          .array(z.object({ id: z.string() }).strip())
          .nullable()
          .transform((v) => v ?? []),
      })
      .strip();
    expect(walkKeys(schema).get("items")).toMatchObject({ isNullable: true });
  });

  // REQ-D1: bare `z.pipe(A, B)` — neither side is a ZodTransform. Convention:
  // descend def.in (input side is what the raw payload is validated against).
  // Pre-fix #619 behavior was already def.in for this case; pinned to guard
  // against the direction-aware refactor regressing the convention.
  it("REQ-D1: bare z.pipe(z.<T>().nullable(), z.<T>()) descends def.in (input-side)", () => {
    const schema = z
      .object({
        f: z.pipe(z.string().nullable(), z.string()),
      })
      .strip();
    expect(walkKeys(schema).get("f")).toEqual({ isNullable: true, isOptional: false });
  });

  // BUT NOT: a genuinely non-nullable preprocessed field returning null is
  // still flagged as a strictness mismatch. The direction-aware fix must not
  // silence drift — only restore visibility into the correct side of the pipe.
  it("BUT NOT: a non-nullable preprocessed field returning null is still flagged", () => {
    const schema = z
      .object({
        f: z.preprocess((v) => v, z.string()),
      })
      .strip();
    const diff = diffSchema(schema, { f: null });
    expect(diff.strictness_mismatches.map((m) => m.field)).toContain("f");
  });
});

describe("unwrapToObject — ZodPipe direction regressions (#623)", () => {
  // REQ-D2: top-level `z.preprocess(fn, z.object({...}))` — target object on
  // def.out must be reachable. Pre-fix this happened to work because the
  // helper tried def.out first; pinned as a regression guard for the
  // direction-aware refactor.
  it("REQ-D2: descends a top-level z.preprocess(fn, z.object({...})) to its ZodObject", () => {
    const schema = z.preprocess((v) => v, z.object({ id: z.string() }).strip());
    const unwrapped = unwrapToObject(schema as unknown as z.ZodType);
    expect(unwrapped).not.toBeNull();
    expect(unwrapped).toBeInstanceOf(z.ZodObject);
    expect(walkKeys(unwrapped!).get("id")).toEqual({ isNullable: false, isOptional: false });
  });

  // REQ-D2: top-level `z.object({...}).transform(fn)` — source object on
  // def.in must be reachable. Pre-fix: def.out was ZodTransform (IS a ZodType)
  // → helper descended to ZodTransform → loop exhausted 16 iterations →
  // returned null → probe refused the schema. Post-fix: direction-aware
  // descent picks def.in when def.out is ZodTransform.
  it("REQ-D2: descends a top-level z.object({...}).transform(fn) to its source ZodObject", () => {
    const schema = z
      .object({ id: z.string() })
      .strip()
      .transform((v) => v);
    const unwrapped = unwrapToObject(schema as unknown as z.ZodType);
    expect(unwrapped).not.toBeNull();
    expect(unwrapped).toBeInstanceOf(z.ZodObject);
    expect(walkKeys(unwrapped!).get("id")).toEqual({ isNullable: false, isOptional: false });
  });

  // REQ-D2: bare top-level `z.pipe(z.object({...}), z.object({...}))` —
  // convention descends def.in (input-side validation target).
  it("REQ-D2: descends a bare z.pipe(z.object({...}), z.object({...})) to def.in ZodObject", () => {
    const schema = z.pipe(z.object({ id: z.string() }).strip(), z.object({ id: z.string() }).strip());
    const unwrapped = unwrapToObject(schema as unknown as z.ZodType);
    expect(unwrapped).not.toBeNull();
    expect(unwrapped).toBeInstanceOf(z.ZodObject);
    expect(walkKeys(unwrapped!).get("id")).toEqual({ isNullable: false, isOptional: false });
  });

  // BUT NOT: a top-level `z.preprocess(fn, z.array(...))` resolves through
  // ZodPipe to ZodArray — not ZodObject — so the helper still returns null,
  // honoring the probe's object-shaped-only contract.
  it("BUT NOT: returns null for a top-level z.preprocess(fn, z.array(...))", () => {
    const schema = z.preprocess((v) => v, z.array(z.string()));
    expect(unwrapToObject(schema as unknown as z.ZodType)).toBeNull();
  });
});

describe("unwrapForDescent — ZodPipe direction regressions (#623)", () => {
  // REQ-D3: a nested `z.preprocess(fn, z.object({...}))` field must have its
  // keys walked. Pre-fix this worked (def.out was already preferred), so this
  // is a regression guard for the direction-aware refactor.
  it("REQ-D3: diffSchema surfaces extras inside a nested z.preprocess(fn, z.object({...}))", () => {
    const schema = z
      .object({
        config: z.preprocess((v) => v, z.object({ x: z.string() }).strip()),
      })
      .strip();
    const diff = diffSchema(schema, { config: { x: "ok", unknown_nested: "val" } });
    expect(diff.extra_fields.map((f) => f.field)).toContain("config.unknown_nested");
  });

  // REQ-D3: a nested `.transform()` over an object must have its keys walked.
  // Pre-fix: unwrapForDescent descended def.out (ZodTransform), bailed out as
  // a leaf → diffSchema treated the field as a leaf → silently invisible
  // (false-negative class — the symmetric counterpart that #620 / #622 fixed
  // for ZodDefault / ZodReadonly). Post-fix: descends def.in.
  it("REQ-D3: diffSchema surfaces extras inside a nested z.object({...}).transform(fn)", () => {
    const schema = z
      .object({
        config: z
          .object({ x: z.string() })
          .strip()
          .transform((v) => v),
      })
      .strip();
    const diff = diffSchema(schema, { config: { x: "ok", unknown_nested: "val" } });
    expect(diff.extra_fields.map((f) => f.field)).toContain("config.unknown_nested");
  });

  // REQ-D3: a nested `.transform()` over an array must surface element-level
  // drift via `items[].field` path qualification. Mirrors the
  // `ClientInvoiceSchema.items` shape (`z.array(...).nullable().transform(...)`)
  // for which walkKeys correctly captured nullability post-#619 but
  // unwrapForDescent silently treated the array as a leaf.
  it("REQ-D3: diffSchema surfaces extras inside a nested z.array(...).transform(fn) elements", () => {
    const schema = z
      .object({
        items: z
          .array(z.object({ id: z.string() }).strip())
          .nullable()
          .transform((v) => v ?? []),
      })
      .strip();
    const diff = diffSchema(schema, { items: [{ id: "1", extra: "val" }] });
    expect(diff.extra_fields.map((f) => f.field)).toContain("items[].extra");
  });

  // BUT NOT: genuine missing-required drift inside a preprocess-wrapped
  // nested object is still flagged. The fix must restore visibility into the
  // wrapped subtree without silencing legitimate findings.
  it("BUT NOT: missing required field inside preprocess-wrapped nested object is still flagged", () => {
    const schema = z
      .object({
        config: z.preprocess((v) => v, z.object({ required: z.string(), opt: z.string().optional() }).strip()),
      })
      .strip();
    const diff = diffSchema(schema, { config: {} });
    expect(diff.missing_fields.map((m) => m.field)).toContain("config.required");
  });
});
