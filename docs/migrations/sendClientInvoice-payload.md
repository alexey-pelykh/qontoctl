# Migration: `sendClientInvoice` now requires a payload argument

**Affected**: Direct consumers of the `@qontoctl/core` `sendClientInvoice`
function. Users going through the CLI (`qontoctl client-invoice send …`)
or the MCP server (`client_invoice_send` tool) are migrated by the
respective package updates shipped alongside this change.

**Shipped in**: `@qontoctl/core` (release containing the [#637] foundation
and this [#639] wiring + migration guide).

## What changed

Prior to this change, `sendClientInvoice` accepted only the invoice ID:

```ts
// Pre-#637 — broken at runtime against Qonto.
await sendClientInvoice(client, id);
```

Internally, the function issued `POST /v2/client_invoices/{id}/send` with
**no request body**. The Qonto API rejected this with HTTP 422
`invalid_body: EOF`, because the official OpenAPI contract for
[`POST /v2/client_invoices/{id}/send`](https://docs.qonto.com/api-reference/business-api/expense-management/client-quotes-notes/client-invoices/send-a-client-invoice.md)
requires a JSON body with at least `send_to` (one or more recipient email
addresses) and `email_title` (the email subject).

After the change, the function takes a third `payload` argument:

```ts
// Post-#637 — required.
import type { SendClientInvoiceRequestPayload } from "@qontoctl/core";
import { sendClientInvoice } from "@qontoctl/core";

const payload: SendClientInvoiceRequestPayload = {
    send_to: ["recipient@example.com"],
    email_title: "Invoice INV-001",
    // copy_to_self defaults to true (Qonto server-side default; the schema
    // applies it on parse), so it may be omitted in inputs run through
    // SendClientInvoiceRequestPayloadSchema.parse(...). When constructing
    // the object directly, supply it explicitly to satisfy the TS type:
    copy_to_self: true,
    // email_body is optional.
    email_body: "Please find the invoice attached.",
};

await sendClientInvoice(client, id, payload);
```

The signature is now:

```ts
export async function sendClientInvoice(
    client: HttpClient,
    id: string,
    payload: SendClientInvoiceRequestPayload,
): Promise<void>;
```

## Why this is a breaking change

This is a **TypeScript compile-error-level** change. Existing call sites
that pass only `(client, id)` will fail `tsc` with:

```
Expected 3 arguments, but got 2.
```

There is no shim or fallback — the previous shape never worked against
the Qonto API, so a runtime-only deprecation would have preserved a
known-broken code path. Failing fast at the type-system boundary lets
direct consumers fix their call sites at upgrade time rather than
discover the 422 in production.

## Migration steps

1. **Inventory call sites**: search for `sendClientInvoice(` in your code.
    ```sh
    rg 'sendClientInvoice\('
    ```
2. **Build the payload** at each call site. The minimum required fields
   are `send_to` (non-empty array of recipient emails) and `email_title`
   (non-empty subject). `copy_to_self` (default `true`) and `email_body`
   are optional from the API's perspective; `copy_to_self` is required at
   the TS-type layer if you construct the object literal directly (the
   schema's `.default(true)` only materializes on `parse(...)`).
3. **Validate inputs at the call boundary** if your application accepts
   user-supplied data. The exported Zod schema is the canonical
   validator:
    ```ts
    import { SendClientInvoiceRequestPayloadSchema } from "@qontoctl/core";
    const payload = SendClientInvoiceRequestPayloadSchema.parse(userInput);
    await sendClientInvoice(client, id, payload);
    ```
4. **Re-run your typecheck** (`tsc --noEmit` or equivalent) to verify
   every prior call site has been updated.

### Source of truth for the payload shape

The Zod schema and TypeScript type both ship from `@qontoctl/core`:

```ts
export type SendClientInvoiceRequestPayload = z.infer<typeof SendClientInvoiceRequestPayloadSchema>;

// Schema (excerpt):
// {
//   send_to: string[]       // recipient emails
//   copy_to_self: boolean   // defaults to true server-side
//   email_title: string     // email subject
//   email_body?: string     // optional body
// }
```

Mirrors the Qonto OpenAPI `SendClientInvoiceRequestPayload` schema
exactly. The schema is **identical** to the quotes-side
`SendQuoteRequestPayloadSchema` — both endpoints accept the same
underlying `SendRequestPayload` shape.

Authoritative reference:
[Qonto API — Send a client invoice](https://docs.qonto.com/api-reference/business-api/expense-management/client-quotes-notes/client-invoices/send-a-client-invoice.md).

## Related changes

- [#637](https://github.com/alexey-pelykh/qontoctl/pull/640) — foundation: introduces the
  payload schema/type and changes the `sendClientInvoice` signature
  (lands the breaking change at the core boundary; ships placeholder
  payloads in the CLI/MCP tools to keep the build green).
- [#638](https://github.com/alexey-pelykh/qontoctl/issues/638) — parallel
  fix on the quotes side: wires `quote_send` through the analogous
  `sendQuote` service with the same `SendRequestPayload` shape.
- [#639](https://github.com/alexey-pelykh/qontoctl/issues/639) — this
  change: wires the CLI `client-invoice send` command and MCP
  `client_invoice_send` tool through the new signature; ships this
  migration guide.
- [#636](https://github.com/alexey-pelykh/qontoctl/issues/636) — the
  original `quote_send` HTTP 422 investigation that surfaced the
  parallel `client_invoice_send` defect.
