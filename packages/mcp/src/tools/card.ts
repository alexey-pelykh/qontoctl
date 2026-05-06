// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CreateCardParams,
  HttpClient,
  UpdateCardLimitsParams,
  UpdateCardOptionsParams,
  UpdateCardRestrictionsParams,
} from "@qontoctl/core";
import {
  getCard,
  listCards,
  createCard,
  bulkCreateCards,
  lockCard,
  unlockCard,
  reportCardLost,
  reportCardStolen,
  discardCard,
  updateCardLimits,
  updateCardNickname,
  updateCardOptions,
  updateCardRestrictions,
  getCardIframeUrl,
  listCardAppearances,
} from "@qontoctl/core";
import { withClient } from "../errors.js";
import { coreOptionsFromContext, executeWithMcpSca, scaContinuationSchema, scaOptionsFromArgs } from "../sca.js";

export function registerCardTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "card_list",
    {
      description: "List cards in the organization",
      inputSchema: {
        query: z.string().optional().describe("Search by name, ID, last digits, etc."),
        holder_ids: z.array(z.string()).optional().describe("Filter by cardholder membership IDs"),
        statuses: z
          .array(
            z.enum([
              "pending",
              "live",
              "paused",
              "stolen",
              "lost",
              "pin_blocked",
              "discarded",
              "expired",
              "shipped_lost",
              "onhold",
              "order_canceled",
              "pre_expired",
              "abusive",
            ]),
          )
          .optional()
          .describe("Filter by card status"),
        bank_account_ids: z.array(z.string()).optional().describe("Filter by bank account IDs"),
        card_levels: z
          .array(z.enum(["standard", "plus", "metal", "virtual", "virtual_partner", "flash", "advertising"]))
          .optional()
          .describe("Filter by card level"),
        sort_by: z.string().optional().describe("Sort order (e.g. status:asc, created_at:desc)"),
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const result = await listCards(client, {
          ...(args.query !== undefined ? { query: args.query } : {}),
          ...(args.holder_ids !== undefined && args.holder_ids.length > 0 ? { holder_ids: args.holder_ids } : {}),
          ...(args.statuses !== undefined && args.statuses.length > 0 ? { statuses: args.statuses } : {}),
          ...(args.bank_account_ids !== undefined && args.bank_account_ids.length > 0
            ? { bank_account_ids: args.bank_account_ids }
            : {}),
          ...(args.card_levels !== undefined && args.card_levels.length > 0 ? { card_levels: args.card_levels } : {}),
          ...(args.sort_by !== undefined ? { sort_by: args.sort_by } : {}),
          ...(args.page !== undefined ? { page: args.page } : {}),
          ...(args.per_page !== undefined ? { per_page: args.per_page } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ cards: result.cards, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_show",
    {
      description: "Show details of a specific card",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const card = await getCard(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_create",
    {
      description:
        "Create a new card. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        holder_id: z.string().describe("Cardholder membership ID"),
        initiator_id: z.string().describe("Order initiator membership ID"),
        organization_id: z.string().describe("Organization ID"),
        bank_account_id: z.string().describe("Bank account ID"),
        card_level: z
          .enum(["standard", "plus", "metal", "virtual", "virtual_partner", "flash", "advertising"])
          .describe("Card level"),
        ship_to_business: z.boolean().optional().describe("Ship card to organization address"),
        atm_option: z.boolean().optional().describe("Enable ATM withdrawals"),
        nfc_option: z.boolean().optional().describe("Enable contactless payments"),
        foreign_option: z.boolean().optional().describe("Enable international payments"),
        online_option: z.boolean().optional().describe("Enable online payments"),
        atm_monthly_limit: z.number().int().optional().describe("Monthly ATM withdrawal limit (EUR)"),
        atm_daily_limit_option: z.boolean().optional().describe("Enable daily ATM limit"),
        atm_daily_limit: z.number().int().optional().describe("Daily ATM withdrawal limit (EUR)"),
        payment_monthly_limit: z.number().int().optional().describe("Monthly payment limit (EUR)"),
        payment_daily_limit_option: z.boolean().optional().describe("Enable daily payment limit"),
        payment_daily_limit: z.number().int().optional().describe("Daily payment limit (EUR)"),
        payment_transaction_limit_option: z.boolean().optional().describe("Enable per-transaction limit"),
        payment_transaction_limit: z.number().int().optional().describe("Per-transaction limit (EUR)"),
        payment_lifespan_limit: z.number().int().optional().describe("Total spending cap (flash cards, EUR)"),
        pre_expires_at: z.string().optional().describe("Flash card validity end (ISO 8601)"),
        active_days: z.array(z.number().int().min(1).max(7)).optional().describe("Active weekdays (1=Mon, 7=Sun)"),
        categories: z.array(z.string()).optional().describe("Allowed merchant categories"),
        card_design: z.string().optional().describe("Card design identifier"),
        type_of_print: z.enum(["print", "embossed"]).optional().describe("Print type (Plus cards only)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: CreateCardParams = {
          holder_id: args.holder_id,
          initiator_id: args.initiator_id,
          organization_id: args.organization_id,
          bank_account_id: args.bank_account_id,
          card_level: args.card_level,
          ...(args.ship_to_business !== undefined ? { ship_to_business: args.ship_to_business } : {}),
          ...(args.atm_option !== undefined ? { atm_option: args.atm_option } : {}),
          ...(args.nfc_option !== undefined ? { nfc_option: args.nfc_option } : {}),
          ...(args.foreign_option !== undefined ? { foreign_option: args.foreign_option } : {}),
          ...(args.online_option !== undefined ? { online_option: args.online_option } : {}),
          ...(args.atm_monthly_limit !== undefined ? { atm_monthly_limit: args.atm_monthly_limit } : {}),
          ...(args.atm_daily_limit_option !== undefined ? { atm_daily_limit_option: args.atm_daily_limit_option } : {}),
          ...(args.atm_daily_limit !== undefined ? { atm_daily_limit: args.atm_daily_limit } : {}),
          ...(args.payment_monthly_limit !== undefined ? { payment_monthly_limit: args.payment_monthly_limit } : {}),
          ...(args.payment_daily_limit_option !== undefined
            ? { payment_daily_limit_option: args.payment_daily_limit_option }
            : {}),
          ...(args.payment_daily_limit !== undefined ? { payment_daily_limit: args.payment_daily_limit } : {}),
          ...(args.payment_transaction_limit_option !== undefined
            ? { payment_transaction_limit_option: args.payment_transaction_limit_option }
            : {}),
          ...(args.payment_transaction_limit !== undefined
            ? { payment_transaction_limit: args.payment_transaction_limit }
            : {}),
          ...(args.payment_lifespan_limit !== undefined ? { payment_lifespan_limit: args.payment_lifespan_limit } : {}),
          ...(args.pre_expires_at !== undefined ? { pre_expires_at: args.pre_expires_at } : {}),
          ...(args.active_days !== undefined ? { active_days: args.active_days } : {}),
          ...(args.categories !== undefined ? { categories: args.categories } : {}),
          ...(args.card_design !== undefined ? { card_design: args.card_design } : {}),
          ...(args.type_of_print !== undefined ? { type_of_print: args.type_of_print } : {}),
        };

        return executeWithMcpSca(
          client,
          (context) =>
            createCard(client, params, coreOptionsFromContext(context)),
          (card) => ({
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(card, null, 2),
              },
            ],
          }),
          scaOptionsFromArgs(args),
        );
      }),
  );

  server.registerTool(
    "card_bulk_create",
    {
      description:
        "Bulk create cards (up to 50). SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        cards: z
          .array(
            z.object({
              holder_id: z.string(),
              initiator_id: z.string(),
              organization_id: z.string(),
              bank_account_id: z.string(),
              card_level: z.string(),
              ship_to_business: z.boolean().optional(),
              payment_monthly_limit: z.number().int().optional(),
              atm_monthly_limit: z.number().int().optional(),
              atm_daily_limit_option: z.boolean().optional(),
              atm_daily_limit: z.number().int().optional(),
              payment_lifespan_limit: z.number().int().optional(),
              pre_expires_at: z.string().optional(),
            }),
          )
          .min(1)
          .max(50)
          .describe("Array of card definitions"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: CreateCardParams[] = args.cards.map((c) => ({
          holder_id: c.holder_id,
          initiator_id: c.initiator_id,
          organization_id: c.organization_id,
          bank_account_id: c.bank_account_id,
          card_level: c.card_level,
          ...(c.ship_to_business !== undefined ? { ship_to_business: c.ship_to_business } : {}),
          ...(c.payment_monthly_limit !== undefined ? { payment_monthly_limit: c.payment_monthly_limit } : {}),
          ...(c.atm_monthly_limit !== undefined ? { atm_monthly_limit: c.atm_monthly_limit } : {}),
          ...(c.atm_daily_limit_option !== undefined ? { atm_daily_limit_option: c.atm_daily_limit_option } : {}),
          ...(c.atm_daily_limit !== undefined ? { atm_daily_limit: c.atm_daily_limit } : {}),
          ...(c.payment_lifespan_limit !== undefined ? { payment_lifespan_limit: c.payment_lifespan_limit } : {}),
          ...(c.pre_expires_at !== undefined ? { pre_expires_at: c.pre_expires_at } : {}),
        }));

        return executeWithMcpSca(
          client,
          (context) =>
            bulkCreateCards(client, params, coreOptionsFromContext(context)),
          (result) => ({
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          }),
          scaOptionsFromArgs(args),
        );
      }),
  );

  server.registerTool(
    "card_lock",
    {
      description:
        "Lock a card. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            lockCard(client, args.id, coreOptionsFromContext(context)),
          (card) => ({
            content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "card_unlock",
    {
      description:
        "Unlock a card. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            unlockCard(client, args.id, coreOptionsFromContext(context)),
          (card) => ({
            content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "card_report_lost",
    {
      description:
        "Report a physical card as lost (irreversible). SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            reportCardLost(client, args.id, coreOptionsFromContext(context)),
          (card) => ({
            content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "card_report_stolen",
    {
      description:
        "Report a physical card as stolen (irreversible). SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            reportCardStolen(client, args.id, coreOptionsFromContext(context)),
          (card) => ({
            content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "card_discard",
    {
      description:
        "Discard a card (irreversible). SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            discardCard(client, args.id, coreOptionsFromContext(context)),
          (card) => ({
            content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "card_update_limits",
    {
      description:
        "Update a card's spending limits. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        atm_monthly_limit: z.number().int().optional().describe("Monthly ATM withdrawal limit (EUR)"),
        atm_daily_limit_option: z.boolean().optional().describe("Enable daily ATM limit"),
        atm_daily_limit: z.number().int().optional().describe("Daily ATM withdrawal limit (EUR)"),
        payment_monthly_limit: z.number().int().optional().describe("Monthly payment limit (EUR)"),
        payment_daily_limit_option: z.boolean().optional().describe("Enable daily payment limit"),
        payment_daily_limit: z.number().int().optional().describe("Daily payment limit (EUR)"),
        payment_transaction_limit_option: z.boolean().optional().describe("Enable per-transaction limit"),
        payment_transaction_limit: z.number().int().optional().describe("Per-transaction limit (EUR)"),
        payment_lifespan_limit: z.number().int().optional().describe("Total spending cap (flash cards, EUR)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: UpdateCardLimitsParams = {
          ...(args.atm_monthly_limit !== undefined ? { atm_monthly_limit: args.atm_monthly_limit } : {}),
          ...(args.atm_daily_limit_option !== undefined ? { atm_daily_limit_option: args.atm_daily_limit_option } : {}),
          ...(args.atm_daily_limit !== undefined ? { atm_daily_limit: args.atm_daily_limit } : {}),
          ...(args.payment_monthly_limit !== undefined ? { payment_monthly_limit: args.payment_monthly_limit } : {}),
          ...(args.payment_daily_limit_option !== undefined
            ? { payment_daily_limit_option: args.payment_daily_limit_option }
            : {}),
          ...(args.payment_daily_limit !== undefined ? { payment_daily_limit: args.payment_daily_limit } : {}),
          ...(args.payment_transaction_limit_option !== undefined
            ? { payment_transaction_limit_option: args.payment_transaction_limit_option }
            : {}),
          ...(args.payment_transaction_limit !== undefined
            ? { payment_transaction_limit: args.payment_transaction_limit }
            : {}),
          ...(args.payment_lifespan_limit !== undefined ? { payment_lifespan_limit: args.payment_lifespan_limit } : {}),
        };

        return executeWithMcpSca(
          client,
          (context) =>
            updateCardLimits(client, args.id, params, coreOptionsFromContext(context)),
          (card) => ({
            content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        );
      }),
  );

  server.registerTool(
    "card_update_nickname",
    {
      description:
        "Update a card's nickname. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        nickname: z.string().min(1).max(40).describe("New nickname (1-40 characters)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            updateCardNickname(client, args.id, args.nickname, coreOptionsFromContext(context)),
          (card) => ({
            content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "card_update_options",
    {
      description:
        "Update a card's options (ATM, NFC, online, foreign). SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        atm_option: z.boolean().describe("Enable ATM withdrawals"),
        nfc_option: z.boolean().describe("Enable contactless payments"),
        online_option: z.boolean().describe("Enable online payments"),
        foreign_option: z.boolean().describe("Enable international payments"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: UpdateCardOptionsParams = {
          atm_option: args.atm_option,
          nfc_option: args.nfc_option,
          online_option: args.online_option,
          foreign_option: args.foreign_option,
        };

        return executeWithMcpSca(
          client,
          (context) =>
            updateCardOptions(client, args.id, params, coreOptionsFromContext(context)),
          (card) => ({
            content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        );
      }),
  );

  server.registerTool(
    "card_update_restrictions",
    {
      description:
        "Update a card's restrictions (active days, merchant categories). SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
        active_days: z
          .array(z.number().int().min(1).max(7))
          .optional()
          .describe("Active weekdays (1=Monday, 7=Sunday)"),
        categories: z
          .array(
            z.enum([
              "transport",
              "restaurant_and_bar",
              "food_and_grocery",
              "it_and_electronics",
              "utility",
              "tax",
              "legal_and_accounting",
              "atm",
              "office_supply",
              "hardware_and_equipment",
              "finance",
            ]),
          )
          .optional()
          .describe("Allowed merchant categories (empty array disables)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: UpdateCardRestrictionsParams = {
          ...(args.active_days !== undefined ? { active_days: args.active_days } : {}),
          ...(args.categories !== undefined ? { categories: args.categories } : {}),
        };

        return executeWithMcpSca(
          client,
          (context) =>
            updateCardRestrictions(client, args.id, params, coreOptionsFromContext(context)),
          (card) => ({
            content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        );
      }),
  );

  server.registerTool(
    "card_iframe_url",
    {
      description: "Get secure iframe URL for viewing card details (PAN, CVV, expiry)",
      inputSchema: {
        id: z.string().describe("Card ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const url = await getCardIframeUrl(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ iframe_url: url }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "card_appearances",
    {
      description: "List available card appearances (designs by type and level)",
      inputSchema: {},
    },
    async () =>
      withClient(getClient, async (client) => {
        const appearances = await listCardAppearances(client);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(appearances, null, 2),
            },
          ],
        };
      }),
  );
}
