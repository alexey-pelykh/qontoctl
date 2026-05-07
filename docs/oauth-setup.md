# OAuth App Setup Guide

QontoCtl supports OAuth 2.0 authentication for write operations, SCA (Strong Customer Authentication), and other advanced features. Each user or organization must create their own OAuth integration in the Qonto developer portal — QontoCtl does not ship a shared OAuth app.

## Prerequisites

- A **Qonto** business account with **admin** or **owner** access
- **Node.js** >= 24 and **qontoctl** installed

## Step 1: Create an OAuth App

1. Sign in at [developers.qonto.com](https://developers.qonto.com/) with your Qonto account
2. Click **"I need an OAuth 2.0 app"** on the Overview page
3. Select **"Automate your business operations"** and choose your organization
4. Fill in the app details:
    - **App name**: `QontoCtl - <your company>` (suggested)
    - **Logo**: use the QontoCtl logo from the repository (`packages/cli/assets/logo.png`), or run `qontoctl auth setup` to have it saved to your Downloads folder automatically
    - **Redirect URI**: `http://localhost:18920/callback`
5. Select the [scopes](#step-2-select-scopes) your app needs
6. Create the app, then **publish the PRODUCTION version**
   (the sandbox version will not work with production API endpoints)
7. Copy the **Client ID** and **Client Secret** — you'll need them in [Step 3](#step-3-configure-qontoctl)

## Step 2: Select Scopes

Select which scopes to grant your OAuth app. The `qontoctl auth setup` wizard pre-checks the **recommended** set (the most commonly needed scopes) and lets you opt in to additional scopes for specialized commands. For tighter security, deselect any scope you do not need — commands requiring missing scopes will fail gracefully.

The full catalog is grouped by feature area. Scopes marked **(recommended)** are pre-selected during setup.

### Core

| Scope               | Recommended | Enables                                                                            |
| ------------------- | :---------: | ---------------------------------------------------------------------------------- |
| `offline_access`    |     ✅      | Refresh tokens for long-lived sessions without re-login (required for refresh)     |
| `organization.read` |     ✅      | Organization details, bank accounts, transactions, statements, labels, memberships |

### Documents

| Scope              | Recommended | Enables              |
| ------------------ | :---------: | -------------------- |
| `attachment.read`  |     ✅      | Attachment retrieval |
| `attachment.write` |     ✅      | Attachment upload    |

### Banking

| Scope                     | Recommended | Enables                                   |
| ------------------------- | :---------: | ----------------------------------------- |
| `bank_account.write`      |     ✅      | Bank account management                   |
| `internal_transfer.write` |     ✅      | Internal transfers between accounts       |
| `payment.write`           |     ✅      | SEPA transfers and beneficiary management |

### Cards

| Scope        | Recommended | Enables                     |
| ------------ | :---------: | --------------------------- |
| `card.read`  |             | Card listing and details    |
| `card.write` |             | Card creation and lifecycle |

### Clients & Invoicing

| Scope                  | Recommended | Enables                                                                    |
| ---------------------- | :---------: | -------------------------------------------------------------------------- |
| `client.read`          |     ✅      | Client listing and details                                                 |
| `client.write`         |     ✅      | Client create, update, and delete                                          |
| `client_invoice.write` |     ✅      | Client invoice, quote, and credit note write (create/update/finalize/send) |
| `client_invoices.read` |     ✅      | Client invoice, quote, and credit note listing and details                 |
| `einvoicing.read`      |     ✅      | E-invoicing document retrieval                                             |

> **Note**: Qonto's invoice scope naming is asymmetric — write uses the singular form (`client_invoice.write`) while read uses the plural form (`client_invoices.read`). The singular `client_invoice.read` and the plural `client_invoices.write` are NOT recognized scopes (verified via OAuth provider rejection).

### Memberships & Teams

| Scope              | Recommended | Enables                           |
| ------------------ | :---------: | --------------------------------- |
| `membership.read`  |     ✅      | Membership details                |
| `membership.write` |     ✅      | Member invitations and management |
| `team.read`        |             | Team listing and details          |
| `team.write`       |             | Team creation and management      |

### Suppliers

| Scope                    | Recommended | Enables                              |
| ------------------------ | :---------: | ------------------------------------ |
| `supplier_invoice.read`  |     ✅      | Supplier invoice listing and details |
| `supplier_invoice.write` |     ✅      | Supplier invoice creation            |

### Products

| Scope           | Recommended | Enables                                                        |
| --------------- | :---------: | -------------------------------------------------------------- |
| `product.read`  |             | Product catalog listing and details (no qontoctl command yet)  |
| `product.write` |             | Product catalog create/update/delete (no qontoctl command yet) |

> **Note**: Product scopes are listed in Qonto's official catalog but qontoctl does not yet expose product commands. Authorize them only if you plan to use qontoctl alongside other tooling that does.

### Terminals (POS)

| Scope            | Recommended | Enables                                                             |
| ---------------- | :---------: | ------------------------------------------------------------------- |
| `terminal.read`  |             | Qonto Terminal listing and webhook events (no qontoctl command yet) |
| `terminal.write` |             | Qonto Terminal payment creation (no qontoctl command yet)           |

> **Note**: Terminal scopes are verified via per-endpoint docs but absent from Qonto's official catalog page (incomplete). No qontoctl command yet — forward-looking.

### SEPA Direct Debit

| Scope                     | Recommended | Enables                                               |
| ------------------------- | :---------: | ----------------------------------------------------- |
| `sepa_direct_debit.read`  |             | SEPA direct debit retrieval (no qontoctl command yet) |
| `sepa_direct_debit.write` |             | SEPA direct debit creation (no qontoctl command yet)  |

> **Note**: Discovered in OpenAPI security schemes; absent from Qonto's official catalog page. Forward-looking inclusion.

### Insurance

| Scope                      | Recommended | Enables                      |
| -------------------------- | :---------: | ---------------------------- |
| `insurance_contract.read`  |             | Insurance contract retrieval |
| `insurance_contract.write` |             | Insurance contract creation  |

### International

| Scope                          | Recommended | Enables                                 |
| ------------------------------ | :---------: | --------------------------------------- |
| `international_transfer.write` |             | International (SWIFT) transfer creation |

### Payment Links

| Scope                | Recommended | Enables                          |
| -------------------- | :---------: | -------------------------------- |
| `payment_link.read`  |             | Payment link listing and details |
| `payment_link.write` |             | Payment link creation            |

### Requests (Approvals)

| Scope                     | Recommended | Enables                             |
| ------------------------- | :---------: | ----------------------------------- |
| `request_review.write`    |             | Approve or decline pending requests |
| `request_cards.write`     |             | Create flash card requests          |
| `request_transfers.write` |             | Create multi-transfer requests      |

> **Note**: `request_review.read` appears in some OpenAPI security schemes but Qonto's OAuth provider rejects it for typical clients (verified 2026-05); only `request_review.write` is grantable.

### Webhooks

| Scope     | Recommended | Enables                         |
| --------- | :---------: | ------------------------------- |
| `webhook` |     ✅      | Webhook subscription management |

> **Tip**: The `qontoctl auth setup` command renders the same catalog interactively, grouped by category, with the recommended set pre-checked.

### Restricted scopes (partner-gated)

Some Qonto OAuth scopes are gated to specific partner agreements (e.g., Embed integrations). Qonto's authorization server returns `The OAuth 2.0 Client is not allowed to request scope 'X'` if a typical OAuth app attempts to include them, so QontoCtl **hides** them from the `auth setup` picker by default. Partners with the appropriate agreement can include them with the `--trusted-partner` flag:

```sh
qontoctl auth setup --trusted-partner    # restricted scopes appear in the picker
```

You can also add them manually under `oauth.scopes` in your config file. `auth login` reuses whatever is stored in `oauth.scopes`, so once you've selected restricted scopes via setup (or added them manually), they're authorized automatically — no flag needed at login time.

| Scope               | Used by                         | Notes              |
| ------------------- | ------------------------------- | ------------------ |
| `beneficiary.trust` | `beneficiary trust` / `untrust` | Embed-partner only |

### Migrating after a QontoCtl upgrade

When a new version of QontoCtl adds scopes to the recommended set, your stored OAuth token is unaware of them — the access token grants only what was authorized at login time. To pick up newly added recommended scopes:

1. Run `qontoctl auth login` — it prints a notice listing the recommended scopes missing from your stored set.
2. Run `qontoctl auth setup` to re-select scopes (the previously selected ones plus the new additions are pre-checked).
3. Run `qontoctl auth login` again to reauthorize with the updated scope set.

Optional scopes (those not in the recommended set) are not warned about — opt in only if you need the corresponding commands.

## Step 3: Configure QontoCtl

You can configure OAuth credentials using the interactive setup command or manually.

### Option A: Interactive Setup (Recommended)

Run the setup wizard — it walks you through the process and saves credentials automatically:

```sh
qontoctl auth setup
```

With a named profile:

```sh
qontoctl auth setup --profile mycompany
```

### Option B: Profile YAML

Default profile (`~/.qontoctl.yaml`):

```yaml
oauth:
    client-id: "your-client-id"
    client-secret: "your-client-secret"
```

Named profile (`~/.qontoctl/mycompany.yaml`):

```yaml
oauth:
    client-id: "your-client-id"
    client-secret: "your-client-secret"
```

### Option C: Environment Variables

Without a profile:

```sh
export QONTOCTL_CLIENT_ID="your-client-id"
export QONTOCTL_CLIENT_SECRET="your-client-secret"
```

With a named profile (e.g., `--profile mycompany`):

```sh
export QONTOCTL_MYCOMPANY_CLIENT_ID="your-client-id"
export QONTOCTL_MYCOMPANY_CLIENT_SECRET="your-client-secret"
```

## Step 4: Log In

Once credentials are configured, start the OAuth flow:

```sh
qontoctl auth login
```

This opens your browser for authorization. After approving, QontoCtl receives tokens via a local callback server and saves them to your config file.

With a named profile:

```sh
qontoctl auth login --profile mycompany
```

### Token Management

```sh
qontoctl auth status               # Check token status and expiration
qontoctl auth refresh              # Manually refresh an expired token
qontoctl auth revoke               # Revoke tokens and clear stored credentials
```

QontoCtl automatically refreshes expired tokens when `offline_access` scope is granted.

## Sandbox Setup

For development and testing with the Qonto sandbox environment:

1. Create a separate OAuth app on the sandbox developer portal
2. Configure a sandbox profile with a staging token:

```yaml
oauth:
    client-id: "sandbox-client-id"
    client-secret: "sandbox-client-secret"
    staging-token: "your-staging-token"
```

Or via environment variables:

```sh
export QONTOCTL_STAGING_TOKEN="your-staging-token"
export QONTOCTL_CLIENT_ID="sandbox-client-id"
export QONTOCTL_CLIENT_SECRET="sandbox-client-secret"
```

When `oauth.staging-token` is configured (or the `QONTOCTL_STAGING_TOKEN` env var is set), sandbox URLs are used automatically. SCA writes against sandbox additionally need an `X-Qonto-2fa-Preference: mock` header — QontoCtl auto-applies this when a staging token is set. See [`sandbox-testing.md`](./sandbox-testing.md) for SCA-method overrides and the `qontoctl sca-session mock-decision` workflow.

The sandbox uses separate OAuth endpoints:

|       | Production                      | Sandbox                                        |
| ----- | ------------------------------- | ---------------------------------------------- |
| OAuth | `https://oauth.qonto.com/`      | `https://oauth-sandbox.staging.qonto.co/`      |
| API   | `https://thirdparty.qonto.com/` | `https://thirdparty-sandbox.staging.qonto.co/` |

> **Note**: API key authentication uses the production endpoint directly — there is no separate sandbox for API key auth. The sandbox environment is only for OAuth-based integrations.

## Troubleshooting

### "No OAuth credentials found in configuration"

OAuth client credentials are missing. Run `qontoctl auth setup` or add `oauth.client-id` and `oauth.client-secret` to your config file. See [Step 3](#step-3-configure-qontoctl).

### "Invalid client_id"

Verify the app is created and active in the [Qonto developer portal](https://developers.qonto.com/). Make sure you published the **production** version of the app.

### "Invalid redirect_uri"

The redirect URI configured in your OAuth app must match what QontoCtl uses. The default is `http://localhost:18920/callback`. If you use a custom port (`qontoctl auth login --port 9999`), the redirect URI in your app must match (`http://localhost:9999/callback`).

### "Insufficient scopes"

The operation requires an OAuth scope that wasn't granted when the app was created. Update your app's scopes in the developer portal and re-authorize with `qontoctl auth login`.

### Token Expiry

Access tokens expire after a period set by Qonto. If `offline_access` scope was granted, QontoCtl stores a refresh token and can renew automatically. You can also manually refresh:

```sh
qontoctl auth refresh
```

If the refresh token is unavailable or expired, log in again:

```sh
qontoctl auth login
```

### "OAuth state mismatch"

This error indicates the authorization response didn't match the original request, which could indicate a CSRF attack or a stale browser tab. Close all authorization tabs and try `qontoctl auth login` again.
