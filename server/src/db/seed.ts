import { db } from "./connection.js";
import { users, requirements, bids, escrow_payments, disputes } from "./schema.js";
import crypto from "crypto";
const uuidv4 = () => crypto.randomUUID();

const CITIES = ["Mumbai", "Bengaluru", "Delhi NCR", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad"];

async function runSeed() {
  console.log("🌱 Starting OmniBid Production Database Seeding...");

  // 1. Seed Users (Buyers, Providers, Admin)
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
    }
  ];

  console.log(`Inserting ${userRecords.length} primary users...`);
  await db.insert(users).values(userRecords).onConflictDoNothing();

  const buyerTata = userRecords[1];
  const buyerLT = userRecords[2];
  const provIT = userRecords[3];
  const provCivil = userRecords[4];
  const provLogistics = userRecords[5];
  const provLegal = userRecords[6];

  // 2. Seed Requirements
  const reqRecords = [
    {
      id: uuidv4(),
      buyer_id: buyerTata.id,
      title: "Enterprise Multi-Region Kubernetes & Microservices Migration",
      sector: "IT" as const,
      budget: "450000.00",
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
      timeline: "14 days",
      status: "open" as const,
      custom_data: {
        jurisdiction: "High Court of Bombay & RBI FEMA Regulations",
        entity_structure: "Private Limited with Foreign Investor Participation",
      },
    }
  ];

  console.log(`Inserting ${reqRecords.length} sector requirements...`);
  await db.insert(requirements).values(reqRecords).onConflictDoNothing();

  const reqIT = reqRecords[0];
  const reqConst = reqRecords[1];

  // 3. Seed Bids
  const bidRecords = [
    {
      id: uuidv4(),
      requirement_id: reqIT.id,
      provider_id: provIT.id,
      proposal_text: "Full turnkey cloud migration by certified AWS Solution Architects with zero downtime cutover guarantee.",
      bid_amount: "420000.00",
      milestone_count: 3,
      status: "accepted" as const,
    },
    {
      id: uuidv4(),
      requirement_id: reqConst.id,
      provider_id: provCivil.id,
      proposal_text: "Heavy industrial foundation engineering with laser leveling and seismic vibration dampening.",
      bid_amount: "1150000.00",
      milestone_count: 4,
      status: "pending" as const,
    }
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
    }
  ];

  console.log(`Inserting escrow payment with verified TDS & fee computation...`);
  await db.insert(escrow_payments).values(escrowRecords).onConflictDoNothing();

  console.log("✅ OmniBid Database Seeding complete! Populated users, requirements, bids, and financial escrows.");
}

runSeed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
