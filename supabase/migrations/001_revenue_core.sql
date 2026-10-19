-- ============================================================================
-- Migration: 001_revenue_core.sql
-- Description: Core revenue engines, affiliate tracking, and production table enhancements
-- Author: Lead Database Architect, OmniBid India
-- Target Engine: PostgreSQL 15+ (Supabase)
-- ============================================================================

-- Ensure pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENHANCE CORE TABLES (IDEMPOTENT)
-- ============================================================================

-- Enhance users table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gstin VARCHAR(15);
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS digilocker_verified BOOLEAN DEFAULT FALSE;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free';
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;
    END IF;
END $$;

-- Check constraint for subscription_tier
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_users_subscription_tier'
    ) THEN
        ALTER TABLE public.users
        ADD CONSTRAINT check_users_subscription_tier
        CHECK (subscription_tier IN ('free', 'pro'));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Enhance requirements table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'requirements') THEN
        ALTER TABLE public.requirements ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';
        ALTER TABLE public.requirements ADD COLUMN IF NOT EXISTS budget_inr NUMERIC(14, 2);

        -- Backfill budget_inr from budget if existing budget is populated
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'requirements' AND column_name = 'budget') THEN
            UPDATE public.requirements
            SET budget_inr = budget::numeric(14, 2)
            WHERE budget_inr IS NULL AND budget IS NOT NULL;
        END IF;
    END IF;
END $$;

-- Enhance bids table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bids') THEN
        ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS rank_status VARCHAR(20) DEFAULT 'active';
        ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS amount_inr NUMERIC(14, 2);

        -- Backfill amount_inr from bid_amount if existing bid_amount is populated
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND column_name = 'bid_amount') THEN
            UPDATE public.bids
            SET amount_inr = bid_amount::numeric(14, 2)
            WHERE amount_inr IS NULL AND bid_amount IS NOT NULL;
        END IF;
    END IF;
END $$;

-- Check constraint for rank_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_bids_rank_status'
    ) THEN
        ALTER TABLE public.bids
        ADD CONSTRAINT check_bids_rank_status
        CHECK (rank_status IN ('active', 'l1_leader', 'l2', 'l3', 'outbid'));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. REVENUE TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.revenue_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    requirement_id UUID REFERENCES public.requirements(id) ON DELETE SET NULL,
    type VARCHAR(30) NOT NULL,
    gross_amount_paise BIGINT NOT NULL,
    platform_fee_paise BIGINT NOT NULL DEFAULT 0,
    tds_194c_paise BIGINT NOT NULL DEFAULT 0,
    net_settlement_paise BIGINT NOT NULL DEFAULT 0,
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'created',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_revenue_transactions_type CHECK (type IN ('escrow_deposit', 'lead_unlock', 'pro_subscription')),
    CONSTRAINT check_revenue_transactions_status CHECK (status IN ('created', 'paid', 'settled', 'refunded'))
);

-- ============================================================================
-- 3. AFFILIATE OFFERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.affiliate_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    category_keywords TEXT[] NOT NULL,
    partner_name VARCHAR(100) NOT NULL,
    target_url TEXT NOT NULL,
    commission_type VARCHAR(20) NOT NULL DEFAULT 'cpc',
    cpc_or_cpa_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    badge_text VARCHAR(50) DEFAULT 'Sponsored Partner',
    cta_text VARCHAR(100) DEFAULT 'Check Eligibility',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_affiliate_offers_commission_type CHECK (commission_type IN ('cpc', 'cpa', 'rev_share'))
);

-- ============================================================================
-- 4. AFFILIATE CLICKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES public.affiliate_offers(id) ON DELETE CASCADE,
    requirement_id UUID REFERENCES public.requirements(id) ON DELETE SET NULL,
    source_channel VARCHAR(50) NOT NULL,
    visitor_ip_hash VARCHAR(64) NOT NULL,
    utm_campaign VARCHAR(100) DEFAULT 'omnibid_live',
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_affiliate_clicks_source_channel CHECK (source_channel IN ('web_auction', 'whatsapp_broadcast', 'telegram_auto'))
);

-- ============================================================================
-- 5. PERFORMANCE INDEXES
-- ============================================================================

-- Fast querying indexes on revenue_transactions: status, user_id, requirement_id, created_at, type, razorpay_order_id
CREATE INDEX IF NOT EXISTS idx_rev_txn_status ON public.revenue_transactions(status);
CREATE INDEX IF NOT EXISTS idx_rev_txn_user_id ON public.revenue_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_rev_txn_requirement_id ON public.revenue_transactions(requirement_id);
CREATE INDEX IF NOT EXISTS idx_rev_txn_created_at ON public.revenue_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rev_txn_type ON public.revenue_transactions(type);
CREATE INDEX IF NOT EXISTS idx_rev_txn_razorpay_order_id ON public.revenue_transactions(razorpay_order_id);

-- Fast querying indexes on affiliate_offers: active, created_at, category_keywords (GIN)
CREATE INDEX IF NOT EXISTS idx_affiliate_offers_active ON public.affiliate_offers(active);
CREATE INDEX IF NOT EXISTS idx_affiliate_offers_created_at ON public.affiliate_offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_offers_category_keywords ON public.affiliate_offers USING GIN(category_keywords);

-- Fast querying indexes on affiliate_clicks: offer_id, requirement_id, clicked_at, source_channel
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_offer_id ON public.affiliate_clicks(offer_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_requirement_id ON public.affiliate_clicks(requirement_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_clicked_at ON public.affiliate_clicks(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_source_channel ON public.affiliate_clicks(source_channel);

-- Additional indexing on enhanced columns
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON public.users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_requirements_budget_inr ON public.requirements(budget_inr);
CREATE INDEX IF NOT EXISTS idx_bids_rank_status ON public.bids(rank_status);
CREATE INDEX IF NOT EXISTS idx_bids_amount_inr ON public.bids(amount_inr);

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.revenue_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

-- Drop prior policies if exist for idempotency
DROP POLICY IF EXISTS select_revenue_transactions ON public.revenue_transactions;
DROP POLICY IF EXISTS select_affiliate_offers ON public.affiliate_offers;
DROP POLICY IF EXISTS select_affiliate_clicks ON public.affiliate_clicks;
DROP POLICY IF EXISTS insert_affiliate_clicks ON public.affiliate_clicks;

-- revenue_transactions: users can read their own transactions
CREATE POLICY select_revenue_transactions ON public.revenue_transactions
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- affiliate_offers: anyone can view active offers
CREATE POLICY select_affiliate_offers ON public.affiliate_offers
    FOR SELECT
    USING (active = TRUE);

-- affiliate_clicks: tracking insertion open to all callers
CREATE POLICY insert_affiliate_clicks ON public.affiliate_clicks
    FOR INSERT
    WITH CHECK (TRUE);

-- affiliate_clicks: authenticated audit viewing
CREATE POLICY select_affiliate_clicks ON public.affiliate_clicks
    FOR SELECT
    TO authenticated
    USING (TRUE);
