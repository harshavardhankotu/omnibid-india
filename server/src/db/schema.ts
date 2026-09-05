import { pgTable, text, timestamp, uuid, numeric, integer, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { pgView } from "drizzle-orm/pg-core";

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
    timeline: text("timeline").notNull(), // e.g., "30 days"
    status: requirementStatusEnum("status").notNull().default("open"),
    custom_data: jsonb("custom_data").$type<Record<string, any>>().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_requirements_sector_status").on(table.sector, table.status),
    index("idx_requirements_buyer_id").on(table.buyer_id),
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
    milestone_count: integer("milestone_count").notNull().default(1),
    status: bidStatusEnum("status").notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_bids_req_provider").on(table.requirement_id, table.provider_id),
    index("idx_bids_status").on(table.status),
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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  requirements: many(requirements),
  bids: many(bids),
  disputes: many(disputes),
}));

export const requirementsRelations = relations(requirements, ({ one, many }) => ({
  buyer: one(users, { fields: [requirements.buyer_id], references: [users.id] }),
  bids: many(bids),
  escrow_payments: many(escrow_payments),
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
