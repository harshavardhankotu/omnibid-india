import { pgTable, text, timestamp, uuid, numeric, integer, bigint, boolean, varchar, jsonb, pgEnum, index, pgView } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// Enums
export const userRoleEnum = pgEnum("user_role", ["buyer", "provider", "admin"]);
export const kycStatusEnum = pgEnum("kyc_status", ["pending", "verified", "rejected"]);
export const sectorEnum = pgEnum("sector", ["IT", "Construction", "Logistics", "Legal"]);
export const requirementStatusEnum = pgEnum("requirement_status", ["open", "in_escrow", "completed", "disputed"]);
export const bidStatusEnum = pgEnum("bid_status", ["pending", "accepted", "rejected"]);
export const escrowStatusEnum = pgEnum("escrow_status", ["held", "released", "disputed", "refunded"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "arbitration", "resolved"]);

// 1. Users Table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: userRoleEnum("role").notNull().default("buyer"),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  pan_number: text("pan_number"),
  aadhaar_vault_ref: text("aadhaar_vault_ref"),
  kyc_status: kycStatusEnum("kyc_status").notNull().default("pending"),
  razorpay_account_id: text("razorpay_account_id"),
  city: text("city").notNull().default("Bengaluru"),
  state_code: text("state_code").notNull().default("29"), // Indian 2-digit GST state code (29=Karnataka)
  entity_type: text("entity_type").notNull().default("individual"), // "individual" | "company" | "llp" | "huf"
  gstin: varchar("gstin", { length: 15 }),
  digilocker_verified: boolean("digilocker_verified").notNull().default(false),
  subscription_tier: varchar("subscription_tier", { length: 20 }).notNull().default("free").$type<"free" | "pro">(),
  pro_expires_at: timestamp("pro_expires_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 2. Requirements Table
export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyer_id: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sector: sectorEnum("sector").notNull(),
    budget: numeric("budget", { precision: 12, scale: 2 }).notNull(),
    budget_inr: numeric("budget_inr", { precision: 14, scale: 2 }),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    timeline: text("timeline").notNull(), // e.g., "30 days"
    status: requirementStatusEnum("status").notNull().default("open"),
    custom_data: jsonb("custom_data").$type<Record<string, any>>().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_requirements_sector_status").on(table.sector, table.status),
    index("idx_requirements_buyer_id").on(table.buyer_id),
    index("idx_requirements_budget_inr").on(table.budget_inr),
  ]
);

// 3. Bids Table
export const bids = pgTable(
  "bids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirement_id: uuid("requirement_id").notNull().references(() => requirements.id, { onDelete: "cascade" }),
    provider_id: uuid("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    proposal_text: text("proposal_text").notNull(),
    bid_amount: numeric("bid_amount", { precision: 12, scale: 2 }).notNull(),
    amount_inr: numeric("amount_inr", { precision: 14, scale: 2 }),
    milestone_count: integer("milestone_count").notNull().default(1),
    status: bidStatusEnum("status").notNull().default("pending"),
    rank_status: varchar("rank_status", { length: 20 }).notNull().default("active").$type<"active" | "l1_leader" | "l2" | "l3" | "outbid">(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_bids_req_provider").on(table.requirement_id, table.provider_id),
    index("idx_bids_status").on(table.status),
    index("idx_bids_rank_status").on(table.rank_status),
    index("idx_bids_amount_inr").on(table.amount_inr),
  ]
);

// 4. Escrow Payments Table
export const escrow_payments = pgTable(
  "escrow_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirement_id: uuid("requirement_id").notNull().references(() => requirements.id, { onDelete: "cascade" }),
    bid_id: uuid("bid_id").notNull().references(() => bids.id, { onDelete: "cascade" }),
    razorpay_order_id: text("razorpay_order_id").notNull().unique(),
    razorpay_payment_id: text("razorpay_payment_id"),
    total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    platform_fee: numeric("platform_fee", { precision: 12, scale: 2 }).notNull(), // 2%
    tds_amount: numeric("tds_amount", { precision: 12, scale: 2 }).notNull().default("0.00"), // 2% under Sec 194C/J if > ₹30,000
    net_provider_payout: numeric("net_provider_payout", { precision: 12, scale: 2 }).notNull(),
    status: escrowStatusEnum("status").notNull().default("held"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_escrow_payments_status").on(table.status),
    index("idx_escrow_payments_requirement_id").on(table.requirement_id),
  ]
);

// 5. Disputes Table
export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escrow_id: uuid("escrow_id").notNull().references(() => escrow_payments.id, { onDelete: "cascade" }),
    opened_by: uuid("opened_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    evidence_urls: text("evidence_urls").array().default([]),
    status: disputeStatusEnum("status").notNull().default("open"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_disputes_escrow_status").on(table.escrow_id, table.status),
  ]
);

// 6. Webhook Events Table (Idempotency & Replay Protection)
export const webhook_events = pgTable(
  "webhook_events",
  {
    id: text("id").primaryKey(), // Razorpay event_id
    event_type: text("event_type").notNull(),
    resource_id: text("resource_id"),
    payload: jsonb("payload"),
    processed_at: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_webhook_events_event_type").on(table.event_type),
  ]
);

// 7. Invoice Sequences Table (GST Rule 46 Concurrency & Serialization)
export const invoice_sequences = pgTable(
  "invoice_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    financial_year: text("financial_year").notNull().unique(), // e.g. "2026-27"
    last_sequence: integer("last_sequence").notNull().default(0),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 8. Revenue Transactions Table
export const revenue_transactions = pgTable(
  "revenue_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    requirement_id: uuid("requirement_id").references(() => requirements.id, { onDelete: "set null" }),
    type: varchar("type", { length: 30 }).notNull().$type<"escrow_deposit" | "lead_unlock" | "pro_subscription">(),
    gross_amount_paise: bigint("gross_amount_paise", { mode: "number" }).notNull(),
    platform_fee_paise: bigint("platform_fee_paise", { mode: "number" }).notNull().default(0),
    tds_194c_paise: bigint("tds_194c_paise", { mode: "number" }).notNull().default(0),
    net_settlement_paise: bigint("net_settlement_paise", { mode: "number" }).notNull().default(0),
    razorpay_order_id: varchar("razorpay_order_id", { length: 100 }),
    razorpay_payment_id: varchar("razorpay_payment_id", { length: 100 }),
    status: varchar("status", { length: 30 }).notNull().default("created").$type<"created" | "paid" | "settled" | "refunded">(),
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_rev_txn_status").on(table.status),
    index("idx_rev_txn_user_id").on(table.user_id),
    index("idx_rev_txn_requirement_id").on(table.requirement_id),
    index("idx_rev_txn_created_at").on(table.created_at),
  ]
);

// 9. Affiliate Offers Table
export const affiliate_offers = pgTable(
  "affiliate_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    category_keywords: text("category_keywords").array().notNull(),
    partner_name: varchar("partner_name", { length: 100 }).notNull(),
    target_url: text("target_url").notNull(),
    commission_type: varchar("commission_type", { length: 20 }).notNull().default("cpc").$type<"cpc" | "cpa" | "rev_share">(),
    cpc_or_cpa_inr: numeric("cpc_or_cpa_inr", { precision: 10, scale: 2 }).notNull().default("0.00"),
    badge_text: varchar("badge_text", { length: 50 }).default("Sponsored Partner"),
    cta_text: varchar("cta_text", { length: 100 }).default("Check Eligibility"),
    active: boolean("active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_affiliate_offers_active").on(table.active),
    index("idx_affiliate_offers_created_at").on(table.created_at),
  ]
);

// 10. Affiliate Clicks Table
export const affiliate_clicks = pgTable(
  "affiliate_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    offer_id: uuid("offer_id").notNull().references(() => affiliate_offers.id, { onDelete: "cascade" }),
    requirement_id: uuid("requirement_id").references(() => requirements.id, { onDelete: "set null" }),
    source_channel: varchar("source_channel", { length: 50 }).notNull().$type<"web_auction" | "whatsapp_broadcast" | "telegram_auto">(),
    visitor_ip_hash: varchar("visitor_ip_hash", { length: 64 }).notNull(),
    utm_campaign: varchar("utm_campaign", { length: 100 }).default("omnibid_live"),
    clicked_at: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_affiliate_clicks_offer_id").on(table.offer_id),
    index("idx_affiliate_clicks_requirement_id").on(table.requirement_id),
    index("idx_affiliate_clicks_clicked_at").on(table.clicked_at),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  requirements: many(requirements),
  bids: many(bids),
  disputes: many(disputes),
  revenue_transactions: many(revenue_transactions),
}));

export const requirementsRelations = relations(requirements, ({ one, many }) => ({
  buyer: one(users, { fields: [requirements.buyer_id], references: [users.id] }),
  bids: many(bids),
  escrow_payments: many(escrow_payments),
  revenue_transactions: many(revenue_transactions),
  affiliate_clicks: many(affiliate_clicks),
}));

export const bidsRelations = relations(bids, ({ one, many }) => ({
  requirement: one(requirements, { fields: [bids.requirement_id], references: [requirements.id] }),
  provider: one(users, { fields: [bids.provider_id], references: [users.id] }),
  escrow_payments: many(escrow_payments),
}));

export const escrowPaymentsRelations = relations(escrow_payments, ({ one, many }) => ({
  requirement: one(requirements, { fields: [escrow_payments.requirement_id], references: [requirements.id] }),
  bid: one(bids, { fields: [escrow_payments.bid_id], references: [bids.id] }),
  disputes: many(disputes),
}));

export const disputesRelations = relations(disputes, ({ one }) => ({
  escrow_payment: one(escrow_payments, { fields: [disputes.escrow_id], references: [escrow_payments.id] }),
  opened_by_user: one(users, { fields: [disputes.opened_by], references: [users.id] }),
}));

export const revenueTransactionsRelations = relations(revenue_transactions, ({ one }) => ({
  user: one(users, { fields: [revenue_transactions.user_id], references: [users.id] }),
  requirement: one(requirements, { fields: [revenue_transactions.requirement_id], references: [requirements.id] }),
}));

export const affiliateOffersRelations = relations(affiliate_offers, ({ many }) => ({
  clicks: many(affiliate_clicks),
}));

export const affiliateClicksRelations = relations(affiliate_clicks, ({ one }) => ({
  offer: one(affiliate_offers, { fields: [affiliate_clicks.offer_id], references: [affiliate_offers.id] }),
  requirement: one(requirements, { fields: [affiliate_clicks.requirement_id], references: [requirements.id] }),
}));

// Pre-aggregated Analytical Views
export const vwPlatformFinancials = pgView("vw_platform_financials", {
  period: text("period"),
  total_gtv: numeric("total_gtv"),
  total_platform_fees: numeric("total_platform_fees"),
  total_tds_withheld: numeric("total_tds_withheld"),
  total_net_payouts: numeric("total_net_payouts"),
}).as(sql`
  SELECT 
    to_char(created_at, 'YYYY-MM') AS period,
    COALESCE(SUM(total_amount), 0) AS total_gtv,
    COALESCE(SUM(platform_fee), 0) AS total_platform_fees,
    COALESCE(SUM(tds_amount), 0) AS total_tds_withheld,
    COALESCE(SUM(net_provider_payout), 0) AS total_net_payouts
  FROM escrow_payments
  GROUP BY to_char(created_at, 'YYYY-MM')
  ORDER BY period DESC
`);

export const vwSectorAnalytics = pgView("vw_sector_analytics", {
  sector: sectorEnum("sector"),
  total_requirements: integer("total_requirements"),
  avg_budget: numeric("avg_budget"),
  total_bids: integer("total_bids"),
  bid_density: numeric("bid_density"),
}).as(sql`
  SELECT 
    r.sector,
    COUNT(DISTINCT r.id) AS total_requirements,
    ROUND(AVG(r.budget), 2) AS avg_budget,
    COUNT(b.id) AS total_bids,
    ROUND(COUNT(b.id)::numeric / GREATEST(COUNT(DISTINCT r.id), 1), 2) AS bid_density
  FROM requirements r
  LEFT JOIN bids b ON b.requirement_id = r.id
  GROUP BY r.sector
`);

export const vwTrustAndDisputes = pgView("vw_trust_and_disputes", {
  sector: sectorEnum("sector"),
  total_escrows: integer("total_escrows"),
  total_disputes: integer("total_disputes"),
  frozen_capital: numeric("frozen_capital"),
  dispute_rate_pct: numeric("dispute_rate_pct"),
}).as(sql`
  SELECT 
    r.sector,
    COUNT(DISTINCT ep.id) AS total_escrows,
    COUNT(DISTINCT d.id) AS total_disputes,
    COALESCE(SUM(CASE WHEN ep.status = 'disputed' THEN ep.total_amount ELSE 0 END), 0) AS frozen_capital,
    ROUND((COUNT(DISTINCT d.id)::numeric / GREATEST(COUNT(DISTINCT ep.id), 1)) * 100, 2) AS dispute_rate_pct
  FROM requirements r
  JOIN escrow_payments ep ON ep.requirement_id = r.id
  LEFT JOIN disputes d ON d.escrow_id = ep.id
  GROUP BY r.sector
`);

// Infer Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Requirement = typeof requirements.$inferSelect;
export type NewRequirement = typeof requirements.$inferInsert;
export type Bid = typeof bids.$inferSelect;
export type NewBid = typeof bids.$inferInsert;
export type EscrowPayment = typeof escrow_payments.$inferSelect;
export type NewEscrowPayment = typeof escrow_payments.$inferInsert;
export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;
export type WebhookEvent = typeof webhook_events.$inferSelect;
export type NewWebhookEvent = typeof webhook_events.$inferInsert;
export type InvoiceSequence = typeof invoice_sequences.$inferSelect;
export type NewInvoiceSequence = typeof invoice_sequences.$inferInsert;
export type RevenueTransaction = typeof revenue_transactions.$inferSelect;
export type NewRevenueTransaction = typeof revenue_transactions.$inferInsert;
export type AffiliateOffer = typeof affiliate_offers.$inferSelect;
export type NewAffiliateOffer = typeof affiliate_offers.$inferInsert;
export type AffiliateClick = typeof affiliate_clicks.$inferSelect;
export type NewAffiliateClick = typeof affiliate_clicks.$inferInsert;
