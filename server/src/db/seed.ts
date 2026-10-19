import { db } from "./connection.js";
import {
  users,
  requirements,
  bids,
  escrow_payments,
  revenue_transactions,
  affiliate_offers,
  affiliate_clicks,
} from "./schema.js";
import crypto from "crypto";

const uuidv4 = () => crypto.randomUUID();

async function runSeed() {
  console.log("🌱 Starting OmniBid Production Database Seeding (Phase 1 Revenue Core)...");

  // 1. Seed Users (Buyers, Providers, Admin) with GSTIN, DigiLocker, and Subscription Tier
  const userRecords = [
    {
      id: uuidv4(),
      role: "admin" as const,
      name: "SRE Platform Admin",
      email: "admin@omnibid.in",
      phone: "+919876543210",
      pan_number: "ABCDE1234F",
      aadhaar_vault_ref: "vault_aadhaar_001",
      kyc_status: "verified" as const,
      razorpay_account_id: "acc_admin_001",
      city: "Bengaluru",
      state_code: "29",
      entity_type: "company",
      gstin: "29ABCDE1234F1Z5",
      digilocker_verified: true,
      subscription_tier: "pro" as const,
      pro_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    {
      id: uuidv4(),
      role: "buyer" as const,
      name: "Aditi Rao (Tata Digital)",
      email: "aditi.rao@tatadigital.mock",
      phone: "+919876543211",
      pan_number: "BCDEF2345G",
      aadhaar_vault_ref: "vault_aadhaar_002",
      kyc_status: "verified" as const,
      city: "Mumbai",
      state_code: "27",
      entity_type: "company",
      gstin: "27BCDEF2345G1Z3",
      digilocker_verified: true,
      subscription_tier: "pro" as const,
      pro_expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
    {
      id: uuidv4(),
      role: "buyer" as const,
      name: "Vikram Malhotra (L&T Infra)",
      email: "vikram.m@ltinfra.mock",
      phone: "+919876543212",
      pan_number: "CDEFG3456H",
      aadhaar_vault_ref: "vault_aadhaar_003",
      kyc_status: "verified" as const,
      city: "Delhi NCR",
      state_code: "07",
      entity_type: "company",
      gstin: "07CDEFG3456H1Z1",
      digilocker_verified: true,
      subscription_tier: "pro" as const,
      pro_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
    {
      id: uuidv4(),
      role: "provider" as const,
      name: "Karthik Sundaram (CloudScale Tech)",
      email: "karthik@cloudscale.mock",
      phone: "+919876543213",
      pan_number: "DEFGH4567I",
      aadhaar_vault_ref: "vault_aadhaar_004",
      kyc_status: "verified" as const,
      razorpay_account_id: "acc_provider_001",
      city: "Bengaluru",
      state_code: "29",
      entity_type: "llp",
      gstin: "29DEFGH4567I1Z8",
      digilocker_verified: true,
      subscription_tier: "pro" as const,
      pro_expires_at: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
    },
    {
      id: uuidv4(),
      role: "provider" as const,
      name: "Rajesh Sharma (Apex Civil Works)",
      email: "rajesh@apexcivil.mock",
      phone: "+919876543214",
      pan_number: "EFGHI5678J",
      aadhaar_vault_ref: "vault_aadhaar_005",
      kyc_status: "verified" as const,
      razorpay_account_id: "acc_provider_002",
      city: "Pune",
      state_code: "27",
      entity_type: "company",
      gstin: "27EFGHI5678J1Z6",
      digilocker_verified: true,
      subscription_tier: "free" as const,
    },
    {
      id: uuidv4(),
      role: "provider" as const,
      name: "Sanjay Singhania (Bharat Logistics)",
      email: "sanjay@bharatlogistics.mock",
      phone: "+919876543215",
      pan_number: "FGHIJ6789K",
      aadhaar_vault_ref: "vault_aadhaar_006",
      kyc_status: "verified" as const,
      razorpay_account_id: "acc_provider_003",
      city: "Ahmedabad",
      state_code: "24",
      entity_type: "company",
      gstin: "24FGHIJ6789K1Z4",
      digilocker_verified: false,
      subscription_tier: "free" as const,
    },
    {
      id: uuidv4(),
      role: "provider" as const,
      name: "Meera Krishnan & Partners Legal",
      email: "meera@krishnanlegal.mock",
      phone: "+919876543216",
      pan_number: "GHIJK7890L",
      aadhaar_vault_ref: "vault_aadhaar_007",
      kyc_status: "verified" as const,
      razorpay_account_id: "acc_provider_004",
      city: "Chennai",
      state_code: "33",
      entity_type: "llp",
      gstin: "33GHIJK7890L1Z2",
      digilocker_verified: true,
      subscription_tier: "free" as const,
    },
  ];

  console.log(`Inserting ${userRecords.length} primary users...`);
  await db.insert(users).values(userRecords).onConflictDoNothing();

  const buyerTata = userRecords[1];
  const buyerLT = userRecords[2];
  const provIT = userRecords[3];
  const provCivil = userRecords[4];
  const provLogistics = userRecords[5];
  const provLegal = userRecords[6];

  // 2. Seed Requirements with language & budget_inr
  const reqRecords = [
    {
      id: uuidv4(),
      buyer_id: buyerTata.id,
      title: "Enterprise Multi-Region Kubernetes & Microservices Migration",
      sector: "IT" as const,
      budget: "450000.00",
      budget_inr: "450000.00",
      language: "en",
      timeline: "45 days",
      status: "in_escrow" as const,
      custom_data: {
        tech_stack: ["Kubernetes", "AWS EKS", "Terraform", "Go", "TypeScript"],
        uptime_sla: "99.99%",
        security_compliance: "ISO-27001, SOC-2",
      },
    },
    {
      id: uuidv4(),
      buyer_id: buyerLT.id,
      title: "Warehouse Pre-Engineered Steel Structural Foundation Construction",
      sector: "Construction" as const,
      budget: "1200000.00",
      budget_inr: "1200000.00",
      language: "hi",
      timeline: "90 days",
      status: "open" as const,
      custom_data: {
        total_sqft: 25000,
        concrete_grade: "M30 RMC",
        safety_protocols: "IS 456:2000 Standard Compliance",
      },
    },
    {
      id: uuidv4(),
      buyer_id: buyerTata.id,
      title: "Cross-State Heavy Equipment Freight Transit (Mumbai to Bengaluru)",
      sector: "Logistics" as const,
      budget: "180000.00",
      budget_inr: "180000.00",
      language: "en",
      timeline: "7 days",
      status: "completed" as const,
      custom_data: {
        weight_metric_tons: 22.5,
        container_type: "Flatbed Trailer",
        transit_insurance_val: "₹50,00,000",
      },
    },
    {
      id: uuidv4(),
      buyer_id: buyerLT.id,
      title: "Corporate Joint Venture Agreement Drafting & FDI Regulatory Filing",
      sector: "Legal" as const,
      budget: "95000.00",
      budget_inr: "95000.00",
      language: "en",
      timeline: "14 days",
      status: "open" as const,
      custom_data: {
        jurisdiction: "High Court of Bombay & RBI FEMA Regulations",
        entity_structure: "Private Limited with Foreign Investor Participation",
      },
    },
  ];

  console.log(`Inserting ${reqRecords.length} sector requirements...`);
  await db.insert(requirements).values(reqRecords).onConflictDoNothing();

  const reqIT = reqRecords[0];
  const reqConst = reqRecords[1];

  // 3. Seed Bids with amount_inr & rank_status
  const bidRecords = [
    {
      id: uuidv4(),
      requirement_id: reqIT.id,
      provider_id: provIT.id,
      proposal_text: "Full turnkey cloud migration by certified AWS Solution Architects with zero downtime cutover guarantee.",
      bid_amount: "420000.00",
      amount_inr: "420000.00",
      milestone_count: 3,
      status: "accepted" as const,
      rank_status: "l1_leader" as const,
    },
    {
      id: uuidv4(),
      requirement_id: reqConst.id,
      provider_id: provCivil.id,
      proposal_text: "Heavy industrial foundation engineering with laser leveling and seismic vibration dampening.",
      bid_amount: "1150000.00",
      amount_inr: "1150000.00",
      milestone_count: 4,
      status: "pending" as const,
      rank_status: "l1_leader" as const,
    },
  ];

  console.log(`Inserting ${bidRecords.length} competitive bids...`);
  await db.insert(bids).values(bidRecords).onConflictDoNothing();

  const winningBid = bidRecords[0];

  // 4. Seed Escrow Payment with 2% fee & 2% TDS
  const totalAmount = 420000;
  const platformFee = totalAmount * 0.02; // 8400
  const tdsAmount = totalAmount > 30000 ? totalAmount * 0.02 : 0; // 8400
  const netPayout = totalAmount - platformFee - tdsAmount; // 403200

  const escrowId = uuidv4();
  const escrowRecords = [
    {
      id: escrowId,
      requirement_id: reqIT.id,
      bid_id: winningBid.id,
      razorpay_order_id: `order_mock_${Date.now()}_001`,
      razorpay_payment_id: `pay_mock_${Date.now()}_001`,
      total_amount: totalAmount.toFixed(2),
      platform_fee: platformFee.toFixed(2),
      tds_amount: tdsAmount.toFixed(2),
      net_provider_payout: netPayout.toFixed(2),
      status: "held" as const,
    },
  ];

  console.log(`Inserting escrow payment with verified TDS & fee computation...`);
  await db.insert(escrow_payments).values(escrowRecords).onConflictDoNothing();

  // 5. Seed Revenue Transactions (Escrow Deposit, Pro Subscription, Lead Unlock)
  const revTxnRecords = [
    {
      id: uuidv4(),
      user_id: buyerTata.id,
      requirement_id: reqIT.id,
      type: "escrow_deposit" as const,
      gross_amount_paise: 42000000, // ₹4,20,000.00
      platform_fee_paise: 840000, // ₹8,400.00 (2%)
      tds_194c_paise: 840000, // ₹8,400.00 (2% Sec 194C)
      net_settlement_paise: 40320000, // ₹4,03,200.00
      razorpay_order_id: `order_rev_${Date.now()}_001`,
      razorpay_payment_id: `pay_rev_${Date.now()}_001`,
      status: "settled" as const,
      metadata: { gst_invoice_ref: "INV-2026-0001", client_notes: "Phase 1 Production Escrow Deposit" },
    },
    {
      id: uuidv4(),
      user_id: provIT.id,
      requirement_id: null,
      type: "pro_subscription" as const,
      gross_amount_paise: 499900, // ₹4,999.00
      platform_fee_paise: 499900,
      tds_194c_paise: 0,
      net_settlement_paise: 499900,
      razorpay_order_id: `order_pro_${Date.now()}_002`,
      razorpay_payment_id: `pay_pro_${Date.now()}_002`,
      status: "paid" as const,
      metadata: { plan: "pro_annual", tier: "pro", duration_months: 12 },
    },
    {
      id: uuidv4(),
      user_id: provCivil.id,
      requirement_id: reqConst.id,
      type: "lead_unlock" as const,
      gross_amount_paise: 99900, // ₹999.00
      platform_fee_paise: 99900,
      tds_194c_paise: 0,
      net_settlement_paise: 99900,
      razorpay_order_id: `order_lead_${Date.now()}_003`,
      razorpay_payment_id: `pay_lead_${Date.now()}_003`,
      status: "paid" as const,
      metadata: { unlock_type: "verified_lead_rfq", sector: "Construction" },
    },
  ];

  console.log(`Inserting ${revTxnRecords.length} revenue transaction records...`);
  await db.insert(revenue_transactions).values(revTxnRecords).onConflictDoNothing();

  // 6. Seed 10 High-Converting Indian B2B Affiliate Offers
  const affiliateOffersList = [
    {
      id: uuidv4(),
      title: "Lendingkart MSME Working Capital Loans (up to ₹50L instant credit)",
      category_keywords: ["working_capital", "msme_loan", "business_loan", "credit_line", "unsecured_loan", "IT", "Construction", "Logistics", "Legal"],
      partner_name: "Lendingkart Finance",
      target_url: "https://www.lendingkart.com/business-loan/?utm_source=omnibid&utm_medium=affiliate&utm_campaign=msme_credit",
      commission_type: "cpa" as const,
      cpc_or_cpa_inr: "1500.00",
      badge_text: "Instant ₹50L Disbursal",
      cta_text: "Check Loan Eligibility",
      active: true,
    },
    {
      id: uuidv4(),
      title: "JSW One MSME Bulk TMT Rebars & Steel Beams (Direct mill rates)",
      category_keywords: ["steel", "tmt_bars", "rebars", "structural_steel", "raw_materials", "Construction", "civil_engineering"],
      partner_name: "JSW One MSME",
      target_url: "https://www.jswonemsme.com/products/steel?utm_source=omnibid&utm_medium=affiliate&utm_campaign=direct_mill",
      commission_type: "cpc" as const,
      cpc_or_cpa_inr: "45.00",
      badge_text: "Direct Mill Pricing",
      cta_text: "Get Wholesale Quote",
      active: true,
    },
    {
      id: uuidv4(),
      title: "Tata Tiscon Construction Wire & Rods",
      category_keywords: ["tata_tiscon", "tmt", "wire_rods", "reinforcement", "building_materials", "Construction"],
      partner_name: "Tata Steel Tiscon",
      target_url: "https://tatatiscon.co.in/buy-online?utm_source=omnibid&utm_medium=affiliate&utm_campaign=super_ductile",
      commission_type: "cpc" as const,
      cpc_or_cpa_inr: "40.00",
      badge_text: "BIS 550D Certified",
      cta_text: "Check Mill Rates",
      active: true,
    },
    {
      id: uuidv4(),
      title: "Shriram Finance Commercial Equipment & Tipper Loan",
      category_keywords: ["equipment_loan", "tipper_finance", "commercial_vehicle", "heavy_machinery", "Logistics", "Construction"],
      partner_name: "Shriram Finance",
      target_url: "https://www.shriramfinance.in/commercial-vehicle-loan?utm_source=omnibid&utm_medium=affiliate",
      commission_type: "cpa" as const,
      cpc_or_cpa_inr: "2500.00",
      badge_text: "Lowest EMI 8.5%",
      cta_text: "Check Eligibility",
      active: true,
    },
    {
      id: uuidv4(),
      title: "myBillBook GST Invoicing & E-Way Bill Software for Contractors",
      category_keywords: ["gst_billing", "eway_bill", "accounting", "invoicing", "compliance", "IT", "Construction", "Logistics", "Legal"],
      partner_name: "myBillBook (FloBiz)",
      target_url: "https://mybillbook.in/contractors?utm_source=omnibid&utm_medium=affiliate&utm_campaign=tax_compliance",
      commission_type: "cpa" as const,
      cpc_or_cpa_inr: "450.00",
      badge_text: "Govt GST Ready",
      cta_text: "Start Free Trial",
      active: true,
    },
    {
      id: uuidv4(),
      title: "Moglix Industrial Safety Helmets, Boots & PPE Bulk",
      category_keywords: ["safety_gear", "ppe_kits", "helmets", "safety_shoes", "industrial_supplies", "Construction", "Logistics"],
      partner_name: "Moglix Business",
      target_url: "https://business.moglix.com/safety?utm_source=omnibid&utm_medium=affiliate&utm_campaign=bulk_ppe",
      commission_type: "cpc" as const,
      cpc_or_cpa_inr: "25.00",
      badge_text: "Wholesale PPE Deals",
      cta_text: "Buy in Bulk",
      active: true,
    },
    {
      id: uuidv4(),
      title: "Infra.Market Excavator & JCB Rental Network",
      category_keywords: ["jcb_rental", "excavator", "heavy_machinery", "earthmovers", "site_equipment", "Construction"],
      partner_name: "Infra.Market",
      target_url: "https://infra.market/equipment-rental?utm_source=omnibid&utm_medium=affiliate&utm_campaign=heavy_fleets",
      commission_type: "cpc" as const,
      cpc_or_cpa_inr: "60.00",
      badge_text: "Pan-India Verified Fleets",
      cta_text: "Book Machinery",
      active: true,
    },
    {
      id: uuidv4(),
      title: "Polycab Heavy-Duty Armoured Industrial Cables",
      category_keywords: ["industrial_cables", "armoured_cables", "electrical", "switchgear", "copper_wiring", "IT", "Construction"],
      partner_name: "Polycab India",
      target_url: "https://polycab.com/industrial-cables?utm_source=omnibid&utm_medium=affiliate&utm_campaign=armoured_spec",
      commission_type: "cpc" as const,
      cpc_or_cpa_inr: "35.00",
      badge_text: "IS/IEC Compliant",
      cta_text: "View Tech Catalog",
      active: true,
    },
    {
      id: uuidv4(),
      title: "Astral Commercial Drainage & CPVC Pipes",
      category_keywords: ["cpvc_pipes", "drainage_systems", "commercial_plumbing", "water_tanks", "piping", "Construction"],
      partner_name: "Astral Pipes",
      target_url: "https://astralpipes.com/commercial-plumbing?utm_source=omnibid&utm_medium=affiliate&utm_campaign=high_pressure",
      commission_type: "cpc" as const,
      cpc_or_cpa_inr: "30.00",
      badge_text: "High Pressure Rated",
      cta_text: "Request Price List",
      active: true,
    },
    {
      id: uuidv4(),
      title: "Porter Enterprise Fleet Transport & Inter-City Freight",
      category_keywords: ["fleet_transport", "intercity_freight", "trucking", "logistics_delivery", "container_trucks", "Logistics"],
      partner_name: "Porter Enterprise",
      target_url: "https://porter.in/enterprise?utm_source=omnibid&utm_medium=affiliate&utm_campaign=intercity_freight",
      commission_type: "cpa" as const,
      cpc_or_cpa_inr: "800.00",
      badge_text: "Pan-India Freight",
      cta_text: "Book Freight Fleet",
      active: true,
    },
  ];

  console.log(`Inserting ${affiliateOffersList.length} high-converting B2B affiliate offers...`);
  await db.insert(affiliate_offers).values(affiliateOffersList).onConflictDoNothing();

  // 7. Seed Sample Affiliate Clicks
  const clickRecords = [
    {
      id: uuidv4(),
      offer_id: affiliateOffersList[0].id,
      requirement_id: reqIT.id,
      source_channel: "web_auction" as const,
      visitor_ip_hash: crypto.createHash("sha256").update("203.0.113.195").digest("hex"),
      utm_campaign: "omnibid_it_escrow",
    },
    {
      id: uuidv4(),
      offer_id: affiliateOffersList[1].id,
      requirement_id: reqConst.id,
      source_channel: "whatsapp_broadcast" as const,
      visitor_ip_hash: crypto.createHash("sha256").update("198.51.100.44").digest("hex"),
      utm_campaign: "omnibid_construction_steel",
    },
    {
      id: uuidv4(),
      offer_id: affiliateOffersList[4].id,
      requirement_id: null,
      source_channel: "telegram_auto" as const,
      visitor_ip_hash: crypto.createHash("sha256").update("192.0.2.78").digest("hex"),
      utm_campaign: "omnibid_pro_vendor_blast",
    },
  ];

  console.log(`Inserting ${clickRecords.length} sample affiliate clicks...`);
  await db.insert(affiliate_clicks).values(clickRecords).onConflictDoNothing();

  console.log("✅ OmniBid Phase 1 Database Seeding complete! Populated users, requirements, bids, escrows, revenue transactions, and 10 B2B affiliate offers.");
}

runSeed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
