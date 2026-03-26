// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { createServer } from "node:http";
import type { Server } from "node:http";
import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import type { Command } from "commander";
import { intro, outro, text, multiselect, isCancel, cancel, note, spinner } from "@clack/prompts";
import {
  resolveConfig,
  type OAuthCredentials,
  OAUTH_AUTH_URL,
  OAUTH_AUTH_SANDBOX_URL,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
  OAUTH_REVOKE_URL,
  OAUTH_REVOKE_SANDBOX_URL,
  generateCodeVerifier,
  generateCodeChallenge,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  saveOAuthTokens,
  saveOAuthClientCredentials,
  saveOAuthScopes,
  clearOAuthTokens,
} from "@qontoctl/core";
import { addInheritableOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions } from "../options.js";

const DEFAULT_REDIRECT_PORT = 18920;
const DEFAULT_SCOPES = [
  "offline_access",
  "organization.read",
  "attachment.read",
  "attachment.write",
  "bank_account.write",
  "client.read",
  "client.write",
  "client_invoice.write",
  "client_invoices.read",
  "einvoicing.read",
  "internal_transfer.write",
  "membership.read",
  "membership.write",
  "payment.write",
  "supplier_invoice.read",
  "supplier_invoice.write",
  "webhook",
];

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  offline_access: "Refresh tokens for long-lived sessions (required)",
  "organization.read": "Organization, accounts, transactions, statements, labels, memberships",
  "attachment.read": "Attachment retrieval",
  "attachment.write": "Attachment upload",
  "bank_account.write": "Bank account management",
  "client.read": "Client listing and details",
  "client.write": "Client create, update, and delete",
  "client_invoice.write": "Invoice create, update, finalize, and lifecycle",
  "client_invoices.read": "Invoice listing and details",
  "einvoicing.read": "E-invoicing document retrieval",
  "internal_transfer.write": "Internal transfers between accounts",
  "membership.read": "Membership details",
  "membership.write": "Member invitations and management",
  "payment.write": "SEPA transfers and beneficiary management",
  "supplier_invoice.read": "Supplier invoice listing and details",
  "supplier_invoice.write": "Supplier invoice creation",
  webhook: "Webhook subscription management",
};

interface OAuthEndpoints {
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string;
}

function resolveOAuthEndpoints(stagingToken?: string): OAuthEndpoints {
  if (stagingToken !== undefined) {
    return {
      authUrl: OAUTH_AUTH_SANDBOX_URL,
      tokenUrl: OAUTH_TOKEN_SANDBOX_URL,
      revokeUrl: OAUTH_REVOKE_SANDBOX_URL,
    };
  }
  return {
    authUrl: OAUTH_AUTH_URL,
    tokenUrl: OAUTH_TOKEN_URL,
    revokeUrl: OAUTH_REVOKE_URL,
  };
}

async function resolveOAuthConfig(profile: string | undefined): Promise<{ oauth: OAuthCredentials }> {
  const { config } = await resolveConfig({ profile });
  if (config.oauth === undefined) {
    throw new Error(
      "No OAuth credentials found in configuration. " +
        'Add "oauth.client-id" and "oauth.client-secret" to your config file.',
    );
  }
  return { oauth: config.oauth };
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;

  exec(command, (error) => {
    if (error) {
      process.stderr.write(`Failed to open browser automatically. Please visit:\n${url}\n`);
    }
  });
}

function startCallbackServer(
  port: number,
): Promise<{ server: Server; result: Promise<{ code: string; state: string }> }> {
  return new Promise((resolveServer) => {
    let resolveResult: (value: { code: string; state: string }) => void;
    let rejectResult: (error: Error) => void;

    const result = new Promise<{ code: string; state: string }>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error !== null) {
        const description = url.searchParams.get("error_description") ?? error;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Authorization Failed</h1><p>You can close this window.</p></body></html>");
        rejectResult(new Error(`OAuth authorization failed: ${description}`));
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (code === null || state === null) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Invalid Request</h1><p>Missing code or state parameter.</p></body></html>");
        rejectResult(new Error("OAuth callback missing code or state parameter"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body><h1>Authorization Successful</h1><p>You can close this window and return to the terminal.</p></body></html>",
      );
      resolveResult({ code, state });
    });

    server.listen(port, "127.0.0.1", () => {
      resolveServer({ server, result });
    });
  });
}

/**
 * Register the `auth` command group on the given program.
 */
export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("OAuth 2.0 authentication");

  // auth setup
  const setup = auth
    .command("setup")
    .description("Configure OAuth client credentials interactively")
    .addHelpText(
      "after",
      "\nSee the OAuth setup guide: https://github.com/alexey-pelykh/qontoctl/blob/main/docs/oauth-setup.md",
    );
  addInheritableOptions(setup);
  setup.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);

    intro("OAuth Setup");

    // Copy logo to ~/Downloads for easy upload during OAuth app registration
    const logoSource = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "logo.png");
    const logoDestination = join(homedir(), "Downloads", "qontoctl-logo.png");
    let logoSaved = false;
    try {
      await copyFile(logoSource, logoDestination);
      logoSaved = true;
    } catch {
      // Logo not available (e.g. bundled differently), skip silently
    }

    const logoLine = logoSaved
      ? `   - Logo: use the file saved to ${logoDestination}`
      : "   - Logo: use the QontoCtl logo from the repository";

    note(
      [
        "1. Sign in at https://developers.qonto.com/ with your Qonto account",
        '2. Click "I need an OAuth 2.0 app" on the Overview page',
        '3. Select "Automate your business operations" and choose your organization',
        '4. Fill in the app details (suggested name: "QontoCtl - <your company>"):',
        logoLine,
        "   - Redirect URI: http://localhost:18920/callback",
        "5. Select the scopes your app needs (you will choose them below)",
        "6. Create the app, then publish the PRODUCTION version",
        "   (the sandbox version will not work with production API endpoints)",
        "7. Copy the Client ID and Client Secret below",
      ].join("\n"),
      "Setup Instructions",
    );

    // Load existing config for defaults on re-run
    let existingOAuth: OAuthCredentials | undefined;
    try {
      const { config } = await resolveConfig({ profile: opts.profile });
      existingOAuth = config.oauth;
    } catch {
      // No existing config, start fresh
    }

    const clientId = await text({
      message: "Client ID",
      ...(existingOAuth?.clientId !== undefined ? { initialValue: existingOAuth.clientId } : {}),
      validate: (value) => {
        if (!value?.trim()) return "Client ID cannot be empty";
      },
    });
    if (isCancel(clientId)) {
      cancel("Setup cancelled.");
      return;
    }

    const clientSecret = await text({
      message: "Client Secret",
      ...(existingOAuth?.clientSecret !== undefined ? { initialValue: existingOAuth.clientSecret } : {}),
      validate: (value) => {
        if (!value?.trim()) return "Client Secret cannot be empty";
      },
    });
    if (isCancel(clientSecret)) {
      cancel("Setup cancelled.");
      return;
    }

    const selectedScopes = await multiselect({
      message: "Select OAuth scopes (press Enter when done)",
      options: DEFAULT_SCOPES.map((scope) => {
        const hint = SCOPE_DESCRIPTIONS[scope];
        return { value: scope, label: scope, ...(hint !== undefined ? { hint } : {}) };
      }),
      initialValues: existingOAuth?.scopes ?? ["offline_access"],
      required: true,
    });
    if (isCancel(selectedScopes)) {
      cancel("Setup cancelled.");
      return;
    }

    // Ensure offline_access is always included
    const scopes = selectedScopes.includes("offline_access") ? selectedScopes : ["offline_access", ...selectedScopes];

    const profileOpts = opts.profile !== undefined ? { profile: opts.profile } : undefined;
    await saveOAuthClientCredentials({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }, profileOpts);
    await saveOAuthScopes(scopes, profileOpts);

    outro('Credentials saved. Run "qontoctl auth login" to authenticate.');
  });

  // auth login
  const login = auth
    .command("login")
    .description("Start OAuth login flow")
    .addHelpText(
      "after",
      "\nSee the OAuth setup guide: https://github.com/alexey-pelykh/qontoctl/blob/main/docs/oauth-setup.md",
    );
  addInheritableOptions(login);
  login.option("--port <number>", "local callback server port", String(DEFAULT_REDIRECT_PORT));
  login.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & { port: string }>(cmd);
    const port = Number.parseInt(opts.port, 10);
    const redirectUri = `http://localhost:${port}/callback`;

    const { oauth } = await resolveOAuthConfig(opts.profile);
    const { authUrl, tokenUrl } = resolveOAuthEndpoints(oauth.stagingToken);

    // Resolve scopes: use stored, or prompt interactively
    let scopes: string[];
    if (oauth.scopes !== undefined && oauth.scopes.length > 0) {
      scopes = oauth.scopes;
    } else {
      const selectedScopes = await multiselect({
        message: "Select OAuth scopes (press Enter when done)",
        options: DEFAULT_SCOPES.map((scope) => {
          const hint = SCOPE_DESCRIPTIONS[scope];
          return { value: scope, label: scope, ...(hint !== undefined ? { hint } : {}) };
        }),
        initialValues: ["offline_access"],
        required: true,
      });
      if (isCancel(selectedScopes)) {
        cancel("Login cancelled.");
        return;
      }

      scopes = selectedScopes.includes("offline_access") ? selectedScopes : ["offline_access", ...selectedScopes];
      await saveOAuthScopes(scopes, opts.profile !== undefined ? { profile: opts.profile } : undefined);
    }

    // Ensure offline_access is always included
    if (!scopes.includes("offline_access")) {
      scopes = ["offline_access", ...scopes];
    }

    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString("hex");

    // Start callback server
    const { server, result } = await startCallbackServer(port);

    try {
      // Build authorization URL
      const authorizationUrl = new URL(authUrl);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("client_id", oauth.clientId);
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("scope", scopes.join(" "));
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("code_challenge", codeChallenge);
      authorizationUrl.searchParams.set("code_challenge_method", "S256");

      // Open browser and wait for authorization
      const s = spinner();
      s.start("Opening browser for authorization...");
      openBrowser(authorizationUrl.toString());
      s.message(`Waiting for authorization on http://localhost:${port}/callback...`);

      // Wait for callback
      const callback = await result;
      s.stop("Authorization received.");

      // Verify state
      if (callback.state !== state) {
        throw new Error("OAuth state mismatch — possible CSRF attack");
      }

      // Exchange code for tokens
      s.start("Exchanging authorization code for tokens...");
      const tokens = await exchangeCode(
        tokenUrl,
        oauth.clientId,
        oauth.clientSecret,
        callback.code,
        redirectUri,
        codeVerifier,
        oauth.stagingToken,
      );

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

      // Save tokens
      await saveOAuthTokens(
        {
          accessToken: tokens.accessToken,
          ...(tokens.refreshToken !== undefined ? { refreshToken: tokens.refreshToken } : {}),
          accessTokenExpiresAt: expiresAt,
        },
        opts.profile !== undefined ? { profile: opts.profile } : undefined,
      );

      s.stop("Login successful! Tokens saved.");
    } finally {
      server.close();
    }
  });

  // auth refresh
  const refresh = auth.command("refresh").description("Refresh the OAuth access token");
  addInheritableOptions(refresh);
  refresh.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const { oauth } = await resolveOAuthConfig(opts.profile);
    const { tokenUrl } = resolveOAuthEndpoints(oauth.stagingToken);

    if (!oauth.refreshToken) {
      throw new Error('No refresh token available. Run "qontoctl auth login" with offline_access scope first.');
    }

    process.stderr.write("Refreshing access token...\n");
    const tokens = await refreshAccessToken(
      tokenUrl,
      oauth.clientId,
      oauth.clientSecret,
      oauth.refreshToken,
      oauth.stagingToken,
    );

    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

    await saveOAuthTokens(
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? oauth.refreshToken,
        accessTokenExpiresAt: expiresAt,
      },
      opts.profile !== undefined ? { profile: opts.profile } : undefined,
    );

    process.stderr.write("Access token refreshed successfully.\n");
  });

  // auth status
  const status = auth.command("status").description("Display OAuth token status");
  addInheritableOptions(status);
  status.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const { oauth } = await resolveOAuthConfig(opts.profile);

    if (!oauth.accessToken) {
      process.stdout.write("Status: Not logged in\n");
      process.stdout.write('Run "qontoctl auth login" to authenticate.\n');
      return;
    }

    const hasRefreshToken = Boolean(oauth.refreshToken);

    if (oauth.accessTokenExpiresAt) {
      const expiresAt = new Date(oauth.accessTokenExpiresAt);
      const now = new Date();
      const isExpired = expiresAt <= now;
      const remainingMs = expiresAt.getTime() - now.getTime();

      process.stdout.write(`Status: ${isExpired ? "Expired" : "Active"}\n`);
      process.stdout.write(`Expires: ${oauth.accessTokenExpiresAt}\n`);

      if (!isExpired) {
        const minutes = Math.floor(remainingMs / 60000);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
          process.stdout.write(`Remaining: ${hours}h ${minutes % 60}m\n`);
        } else {
          process.stdout.write(`Remaining: ${minutes}m\n`);
        }
      }
    } else {
      process.stdout.write("Status: Active (no expiration info)\n");
    }

    process.stdout.write(`Refresh token: ${hasRefreshToken ? "Available" : "Not available"}\n`);

    if (oauth.scopes && oauth.scopes.length > 0) {
      process.stdout.write(`Scopes: ${oauth.scopes.join(", ")}\n`);
    } else {
      process.stdout.write("Scopes: not configured (run auth setup)\n");
    }
  });

  // auth revoke
  const revoke = auth.command("revoke").description("Revoke OAuth consent and clear tokens");
  addInheritableOptions(revoke);
  revoke.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const { oauth } = await resolveOAuthConfig(opts.profile);
    const { revokeUrl } = resolveOAuthEndpoints(oauth.stagingToken);

    if (oauth.accessToken) {
      process.stderr.write("Revoking access token...\n");
      try {
        await revokeToken(revokeUrl, oauth.clientId, oauth.clientSecret, oauth.accessToken, oauth.stagingToken);
      } catch (error) {
        process.stderr.write(`Warning: Failed to revoke access token: ${String(error)}\n`);
      }
    }

    if (oauth.refreshToken) {
      process.stderr.write("Revoking refresh token...\n");
      try {
        await revokeToken(revokeUrl, oauth.clientId, oauth.clientSecret, oauth.refreshToken, oauth.stagingToken);
      } catch (error) {
        process.stderr.write(`Warning: Failed to revoke refresh token: ${String(error)}\n`);
      }
    }

    await clearOAuthTokens(opts.profile !== undefined ? { profile: opts.profile } : undefined);
    process.stderr.write("OAuth tokens revoked and cleared.\n");
  });
}
