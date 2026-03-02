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

Select which scopes to grant your OAuth app. For full QontoCtl functionality, select all scopes below. For tighter security, select only the scopes you need — commands requiring missing scopes will fail gracefully.

| Scope                     | Enables                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `offline_access`          | Refresh tokens for long-lived sessions without re-login                            |
| `organization.read`       | Organization details, bank accounts, transactions, statements, labels, memberships |
| `attachment.read`         | Attachment retrieval                                                               |
| `attachment.write`        | Attachment upload                                                                  |
| `bank_account.write`      | Bank account management                                                            |
| `client.read`             | Client listing and details                                                         |
| `client.write`            | Client create, update, and delete                                                  |
| `client_invoice.write`    | Invoice create, update, finalize, and lifecycle management                         |
| `client_invoices.read`    | Invoice listing and details                                                        |
| `einvoicing.read`         | E-invoicing document retrieval                                                     |
| `internal_transfer.write` | Internal transfers between accounts                                                |
| `membership.read`         | Membership details                                                                 |
| `membership.write`        | Member invitations and management                                                  |
| `payment.write`           | SEPA transfers and beneficiary management                                          |
| `supplier_invoice.read`   | Supplier invoice listing and details                                               |
| `supplier_invoice.write`  | Supplier invoice creation                                                          |

> **Tip**: The `qontoctl auth setup` command prints this scope list interactively for easy reference.

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
2. Configure a sandbox profile:

```yaml
sandbox: true
oauth:
    client-id: "sandbox-client-id"
    client-secret: "sandbox-client-secret"
```

Or via environment variables:

```sh
export QONTOCTL_SANDBOX=true
export QONTOCTL_CLIENT_ID="sandbox-client-id"
export QONTOCTL_CLIENT_SECRET="sandbox-client-secret"
```

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
