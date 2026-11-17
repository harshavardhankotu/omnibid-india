import crypto from "crypto";
import { getTableName } from "drizzle-orm";

// Precomputed bcryptjs hash for "Password@123"
const DEMO_PASSWORD_HASH = "$2b$08$Fzi6rSy8pB2Dl.XqbM9XkONv7NGlMaUU8O5wFHxi60ACJzFIZ73U.";

const now = new Date();
const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3600 * 1000);

const SEED_CATEGORIES = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    name: "Construction",
    slug: "construction",
    iconName: "HardHat",
    description: "Building, renovation, and civil works",
    tier: "both",
    minBidFloor: "10000.00",
    successFeePct: "4.00",
    sectorBadges: { mega_project_eligible: true },
    customFields: [
      { key: "project_type", label: "Project Type", type: "select", options: ["New Build", "Renovation", "Structural Repair"], required: true },
      { key: "material_included", label: "Material Included?", type: "toggle" },
    ],
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    name: "Tech & IT",
    slug: "tech",
    iconName: "Code",
    description: "Software, web, and mobile development",
    tier: "both",
    minBidFloor: "5000.00",
    successFeePct: "10.00",
    sectorBadges: { two_envelope_default: true },
    customFields: [
      { key: "tech_stack", label: "Preferred Stack", type: "text" },
      { key: "github_access", label: "GitHub Access Needed?", type: "toggle" },
    ],
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    name: "Logistics",
    slug: "logistics",
    iconName: "Truck",
    description: "Freight, courier, and transport services",
    tier: "both",
    minBidFloor: "500.00",
    successFeePct: "3.00",
    sectorBadges: { backhaul_eligible: true },
    customFields: [
      { key: "from_city", label: "Origin City", type: "text", required: true },
      { key: "to_city", label: "Destination City", type: "text", required: true },
      { key: "tonnage", label: "Weight (Tons)", type: "number", required: true },
    ],
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    name: "Legal & Govt",
    slug: "legal",
    iconName: "Scale",
    description: "Lawyers, documentation, and court representation",
    tier: "both",
    minBidFloor: "2000.00",
    successFeePct: "8.00",
    sectorBadges: { certification_required: "Bar Council" },
    customFields: [
      { key: "document_type", label: "Case/Document Type", type: "select", options: ["Property", "Contract", "Court Case", "Will"], required: true },
      { key: "jurisdiction", label: "Jurisdiction / Court", type: "text" },
    ],
  },
  {
    id: "10000000-0000-0000-0000-000000000005",
    name: "Home Services",
    slug: "home",
    iconName: "Home",
    description: "Plumbing, electrical, and cleaning",
    tier: "retail",
    minBidFloor: "200.00",
    successFeePct: "5.00",
    sectorBadges: { proximity_match: true },
    customFields: [
      { key: "service_type", label: "Service Type", type: "select", options: ["Plumbing", "Electrical", "Cleaning", "Carpentry"], required: true },
      { key: "sqft", label: "Area (Sq Ft)", type: "number" },
    ],
  },
  {
    id: "10000000-0000-0000-0000-000000000006",
    name: "Heavy Machinery",
    slug: "heavy-machinery",
    iconName: "Wrench",
    description: "Crane hire, JCB, and excavators",
    tier: "both",
    minBidFloor: "5000.00",
    successFeePct: "3.00",
    sectorBadges: { operator_included: true },
    customFields: [
      { key: "machine_type", label: "Machine Type", type: "select", options: ["Crane", "JCB", "Excavator", "Bulldozer"] },
      { key: "duration_days", label: "Duration (Days)", type: "number" },
    ],
  },
  {
    id: "10000000-0000-0000-0000-000000000007",
    name: "Manufacturing",
    slug: "manufacturing",
    iconName: "Factory",
    description: "Job work, fabrication, and assembly",
    tier: "enterprise",
    minBidFloor: "5000.00",
    successFeePct: "3.00",
    sectorBadges: { two_envelope_default: true },
    customFields: [
      { key: "machine_type", label: "Machine Type (CNC, etc.)", type: "text" },
      { key: "unit_count", label: "Units Required", type: "number" },
    ],
  },
  {
    id: "10000000-0000-0000-0000-000000000008",
    name: "Healthcare",
    slug: "healthcare",
    iconName: "Heart",
    description: "Medical procedures, surgeries, and diagnostics",
    tier: "both",
    minBidFloor: "5000.00",
    successFeePct: "5.00",
    sectorBadges: { empty_slot_eligible: true },
    customFields: [],
  },
  {
    id: "10000000-0000-0000-0000-000000000009",
    name: "Finance & Audit",
    slug: "finance",
    iconName: "TrendingUp",
    description: "CA/CS services, GST, and business valuation",
    tier: "both",
    minBidFloor: "2000.00",
    successFeePct: "10.00",
    sectorBadges: { certification_required: "CA/CS" },
    customFields: [],
  },
  {
    id: "10000000-0000-0000-0000-000000000010",
    name: "Agriculture",
    slug: "agriculture",
    iconName: "Leaf",
    description: "Harvesting, procurement, and farm equipment",
    tier: "both",
    minBidFloor: "1000.00",
    successFeePct: "2.00",
    sectorBadges: { mandi_price_linked: true },
    customFields: [],
  },
  {
    id: "10000000-0000-0000-0000-000000000011",
    name: "Events & Wedding",
    slug: "events",
    iconName: "Calendar",
    description: "Planning, catering, and venue management",
    tier: "retail",
    minBidFloor: "20000.00",
    successFeePct: "7.00",
    sectorBadges: { mega_project_eligible: true },
    customFields: [],
  },
  {
    id: "10000000-0000-0000-0000-000000000012",
    name: "Security",
    slug: "security",
    iconName: "Shield",
    description: "Guards, CCTV, and event security",
    tier: "both",
    minBidFloor: "1000.00",
    successFeePct: "5.00",
    sectorBadges: { bench_eligible: true },
    customFields: [],
  },
  {
    id: "10000000-0000-0000-0000-000000000013",
    name: "Export & Customs",
    slug: "customs",
    iconName: "Package",
    description: "Customs clearance and freight forwarding",
    tier: "enterprise",
    minBidFloor: "5000.00",
    successFeePct: "3.00",
    sectorBadges: { gst_mandatory: true },
    customFields: [],
  },
  {
    id: "10000000-0000-0000-0000-000000000014",
    name: "Education",
    slug: "education",
    iconName: "BookOpen",
    description: "Tutors, coaching, and skill development",
    tier: "retail",
    minBidFloor: "300.00",
    successFeePct: "5.00",
    sectorBadges: { demo_bid_eligible: true },
    customFields: [],
  },
];

const SEED_USERS = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Priya Sharma",
    email: "retailbuyer1@omnibid.test",
    phone: "+919876543210",
    passwordHash: DEMO_PASSWORD_HASH,
    role: "retail_buyer",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500081",
    avatarUrl: null,
    trustScore: 85,
    isVerified: true,
    aadhaarVerified: true,
    isProfileComplete: true,
    kycStatus: "verified",
    kycVerifiedAt: now,
    razorpayLinkedAccountId: "acc_mock_buyer_01",
    createdAt: now,
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Reliance Procurement (Demo)",
    email: "enterprisebuyer1@omnibid.test",
    phone: "+919876543211",
    passwordHash: DEMO_PASSWORD_HASH,
    role: "enterprise_buyer",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400051",
    avatarUrl: null,
    trustScore: 95,
    isVerified: true,
    aadhaarVerified: true,
    gstNumber: "27AAACR1234A1Z1",
    isProfileComplete: true,
    kycStatus: "verified",
    kycVerifiedAt: now,
    razorpayLinkedAccountId: "acc_mock_ent_02",
    createdAt: now,
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Ramesh Engineering Works",
    email: "plumber1@omnibid.test",
    phone: "+919876543212",
    passwordHash: DEMO_PASSWORD_HASH,
    role: "solo_provider",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500032",
    avatarUrl: null,
    trustScore: 88,
    isVerified: true,
    aadhaarVerified: true,
    isProfileComplete: true,
    kycStatus: "verified",
    kycVerifiedAt: now,
    razorpayLinkedAccountId: "acc_mock_prov_03",
    createdAt: now,
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "StarCrew Infra Agency",
    email: "agency1@omnibid.test",
    phone: "+919876543213",
    passwordHash: DEMO_PASSWORD_HASH,
    role: "agency_provider",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    avatarUrl: null,
    trustScore: 92,
    isVerified: true,
    aadhaarVerified: true,
    gstNumber: "27AAACS5678B1Z2",
    crewSize: 12,
    isProfileComplete: true,
    kycStatus: "verified",
    kycVerifiedAt: now,
    razorpayLinkedAccountId: "acc_mock_agency_04",
    createdAt: now,
  },
  {
    id: "00000000-0000-0000-0000-000000000099",
    name: "OmniBid Regional Infrastructure Procurement",
    email: "procurement@omnibid.in",
    phone: "+919876543299",
    passwordHash: DEMO_PASSWORD_HASH,
    role: "buyer",
    city: "Hyderabad",
    state: "Telangana",
    state_code: "36",
    entity_type: "company",
    pincode: "500081",
    avatarUrl: null,
    trustScore: 98,
    isVerified: true,
    aadhaarVerified: true,
    kyc_status: "verified",
    kycStatus: "verified",
    kycVerifiedAt: now,
    digilocker_verified: true,
    subscription_tier: "pro",
    razorpayLinkedAccountId: "acc_mock_infra_99",
    createdAt: now,
  },
  {
    id: "00000000-0000-0000-0000-000000000100",
    name: "OmniBid Platform Admin",
    email: "admin@omnibid.admin",
    phone: "+919876543200",
    passwordHash: DEMO_PASSWORD_HASH,
    role: "both",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    avatarUrl: null,
    trustScore: 100,
    isVerified: true,
    aadhaarVerified: true,
    kycStatus: "verified",
    kycVerifiedAt: now,
    razorpayLinkedAccountId: "acc_mock_admin_100",
    createdAt: now,
  },
];

const SEED_REQUIREMENTS = [
  {
    id: "a0000000-0000-0000-0000-000000000001",
    buyerId: "00000000-0000-0000-0000-000000000099",
    buyer_id: "00000000-0000-0000-0000-000000000099",
    categoryId: "10000000-0000-0000-0000-000000000001",
    title: "Supply of 500 MT Fe 550D TMT Rebars for HITEC City Metro Rail Extension",
    description: "Supply of 500 MT Fe 550D primary steel TMT rebars for HITEC City Metro Rail Extension corridor construction conforming to IS 1786 with mill test certificates.",
    customData: { quantity: 500, unit: "MT", grade: "Fe 550D", spec: "IS 1786:2008", project: "HITEC City Metro Rail Extension" },
    custom_data: { quantity: 500, unit: "MT", grade: "Fe 550D", spec: "IS 1786:2008", project: "HITEC City Metro Rail Extension" },
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500081",
    maxBudget: "2400000.00",
    budget: "2400000.00",
    budget_inr: "2400000.00",
    sector: "Construction",
    timeline: "72 hours",
    deadlineHours: 72,
    auctionEndsAt: hoursFromNow(72),
    status: "open",
    bidType: "two_envelope",
    isMegaProject: true,
    isSyndicate: false,
    jugaadMode: false,
    attachmentUrl: null,
    winningBidId: null,
    isHighTicket: true,
    isRecurring: false,
    recurringInterval: null,
    depositAmount: "240000.00",
    depositPaid: true,
    createdAt: now,
  },
  {
    id: "a0000000-0000-0000-0000-000000000002",
    buyerId: "00000000-0000-0000-0000-000000000002",
    buyer_id: "00000000-0000-0000-0000-000000000002",
    categoryId: "10000000-0000-0000-0000-000000000001",
    title: "Ready-Mix Concrete M40 Grade 1200 CuM for Bandra Commercial Tower",
    description: "Ready-Mix Concrete M40 Grade 1200 CuM for Bandra Commercial Tower foundation casting and shear walls with continuous batching and slump retention admixtures.",
    customData: { quantity: 1200, unit: "CuM", grade: "M40 RMC", project: "Bandra Commercial Tower" },
    custom_data: { quantity: 1200, unit: "CuM", grade: "M40 RMC", project: "Bandra Commercial Tower" },
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400051",
    maxBudget: "5400000.00",
    budget: "5400000.00",
    budget_inr: "5400000.00",
    sector: "Construction",
    timeline: "96 hours",
    deadlineHours: 96,
    auctionEndsAt: hoursFromNow(96),
    status: "open",
    bidType: "two_envelope",
    isMegaProject: true,
    isSyndicate: false,
    jugaadMode: false,
    attachmentUrl: null,
    winningBidId: null,
    isHighTicket: true,
    isRecurring: false,
    recurringInterval: null,
    depositAmount: "540000.00",
    depositPaid: true,
    createdAt: now,
  },
  {
    id: "a0000000-0000-0000-0000-000000000003",
    buyerId: "00000000-0000-0000-0000-000000000002",
    buyer_id: "00000000-0000-0000-0000-000000000002",
    categoryId: "10000000-0000-0000-0000-000000000002",
    title: "Enterprise GST & E-Way Bill ERP Microservice Integration (Node + React)",
    description: "Build and deploy an automated GST e-Invoice & E-Way Bill reconciliation microservice with NIC API integration, audit trail, and role-based access.",
    customData: { tech_stack: "Node.js, TypeScript, React, PostgreSQL", github_access: true },
    custom_data: { tech_stack: "Node.js, TypeScript, React, PostgreSQL", github_access: true },
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560100",
    maxBudget: "850000.00",
    budget: "850000.00",
    budget_inr: "850000.00",
    sector: "IT",
    timeline: "48 hours",
    deadlineHours: 48,
    auctionEndsAt: hoursFromNow(48),
    status: "open",
    bidType: "two_envelope",
    isMegaProject: false,
    isSyndicate: false,
    jugaadMode: false,
    attachmentUrl: null,
    winningBidId: null,
    isHighTicket: true,
    isRecurring: false,
    recurringInterval: null,
    depositAmount: "85000.00",
    depositPaid: true,
    createdAt: now,
  },
  {
    id: "a0000000-0000-0000-0000-000000000004",
    buyerId: "00000000-0000-0000-0000-000000000099",
    buyer_id: "00000000-0000-0000-0000-000000000099",
    categoryId: "10000000-0000-0000-0000-000000000007",
    title: "Marine Grade Structural Steel Fabrications for Vizag Port Terminal",
    description: "Marine Grade Structural Steel Fabrications for Vizag Port Terminal with heavy epoxy coating, anti-corrosive primer, and ultrasonic testing.",
    customData: { grade: "Marine Grade Structural Steel", project: "Vizag Port Deepwater Cargo Terminal" },
    custom_data: { grade: "Marine Grade Structural Steel", project: "Vizag Port Deepwater Cargo Terminal" },
    city: "Visakhapatnam",
    state: "Andhra Pradesh",
    pincode: "530035",
    maxBudget: "4200000.00",
    budget: "4200000.00",
    budget_inr: "4200000.00",
    sector: "Construction",
    timeline: "120 hours",
    deadlineHours: 120,
    auctionEndsAt: hoursFromNow(120),
    status: "open",
    bidType: "standard",
    isMegaProject: true,
    isSyndicate: false,
    jugaadMode: false,
    attachmentUrl: null,
    winningBidId: null,
    isHighTicket: true,
    isRecurring: false,
    recurringInterval: null,
    depositAmount: "420000.00",
    depositPaid: true,
    createdAt: now,
  },
  {
    id: "a0000000-0000-0000-0000-000000000005",
    buyerId: "00000000-0000-0000-0000-000000000001",
    buyer_id: "00000000-0000-0000-0000-000000000001",
    categoryId: "10000000-0000-0000-0000-000000000003",
    title: "32ft Multi-Axle Container Freight Logistics: Pune Chakan to Chennai Sriperumbudur",
    description: "Dedicated closed-body 32ft multi-axle fleet requirement for 18 tons automotive precision components with GPS tracking and transit insurance.",
    customData: { from_city: "Pune", to_city: "Chennai", tonnage: 18, cold_storage: false },
    custom_data: { from_city: "Pune", to_city: "Chennai", tonnage: 18, cold_storage: false },
    city: "Pune",
    state: "Maharashtra",
    pincode: "410501",
    maxBudget: "145000.00",
    budget: "145000.00",
    budget_inr: "145000.00",
    sector: "Logistics",
    timeline: "24 hours",
    deadlineHours: 24,
    auctionEndsAt: hoursFromNow(24),
    status: "open",
    bidType: "standard",
    isMegaProject: false,
    isSyndicate: false,
    jugaadMode: false,
    attachmentUrl: null,
    winningBidId: null,
    isHighTicket: true,
    isRecurring: true,
    recurringInterval: "monthly",
    depositAmount: "14500.00",
    depositPaid: true,
    createdAt: now,
  },
  {
    id: "a0000000-0000-0000-0000-000000000006",
    buyerId: "00000000-0000-0000-0000-000000000001",
    buyer_id: "00000000-0000-0000-0000-000000000001",
    categoryId: "10000000-0000-0000-0000-000000000006",
    title: "Industrial Firefighting Piping & Hydrant Grid Installation in Noida Sector 62",
    description: "Turnkey industrial firefighting piping & high-capacity hydrant grid installation conforming to NBC and NFPA standards with jockey pumps and pressure testing.",
    customData: { machine_type: "Crane", duration_days: 15, compliance: "NBC / NFPA" },
    custom_data: { machine_type: "Crane", duration_days: 15, compliance: "NBC / NFPA" },
    city: "Noida",
    state: "Uttar Pradesh",
    pincode: "201301",
    maxBudget: "1850000.00",
    budget: "1850000.00",
    budget_inr: "1850000.00",
    sector: "Construction",
    timeline: "60 hours",
    deadlineHours: 60,
    auctionEndsAt: hoursFromNow(60),
    status: "open",
    bidType: "standard",
    isMegaProject: false,
    isSyndicate: false,
    jugaadMode: false,
    attachmentUrl: null,
    winningBidId: null,
    isHighTicket: true,
    isRecurring: false,
    recurringInterval: null,
    depositAmount: "185000.00",
    depositPaid: true,
    createdAt: now,
  },
  {
    id: "a0000000-0000-0000-0000-000000000007",
    buyerId: "00000000-0000-0000-0000-000000000001",
    buyer_id: "00000000-0000-0000-0000-000000000001",
    categoryId: "10000000-0000-0000-0000-000000000005",
    title: "Commercial Plumbing & Hydro-Pneumatic Pump Overhaul in Banjara Hills",
    description: "Complete replacement of booster manifolds, PRVs, and copper riser sealing for a 12-unit commercial building in Banjara Hills.",
    customData: { service_type: "Plumbing", sqft: 8500 },
    custom_data: { service_type: "Plumbing", sqft: 8500 },
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500034",
    maxBudget: "65000.00",
    budget: "65000.00",
    budget_inr: "65000.00",
    sector: "Home Services",
    timeline: "48 hours",
    deadlineHours: 48,
    auctionEndsAt: hoursFromNow(-24),
    status: "completed",
    bidType: "standard",
    isMegaProject: false,
    isSyndicate: false,
    jugaadMode: false,
    attachmentUrl: null,
    winningBidId: "b0000000-0000-0000-0000-000000000004",
    isHighTicket: false,
    isRecurring: false,
    recurringInterval: null,
    depositAmount: null,
    depositPaid: true,
    createdAt: hoursFromNow(-72),
  },
];

const SEED_BIDS = [
  {
    id: "b0000000-0000-0000-0000-000000000001",
    requirementId: "a0000000-0000-0000-0000-000000000001",
    requirement_id: "a0000000-0000-0000-0000-000000000001",
    providerId: "00000000-0000-0000-0000-000000000004",
    provider_id: "00000000-0000-0000-0000-000000000004",
    bidAmount: "2240000.00",
    bid_amount: "2240000.00",
    message: "Direct JSW & Tata Tiscon Fe 550D mill dispatch within 48 hours with NABL lab test certificates.",
    proposal_text: "Direct JSW & Tata Tiscon Fe 550D mill dispatch within 48 hours with NABL lab test certificates.",
    proofOfWork: "Supplied 1,200 MT to Hyderabad ORR Phase 2",
    portfolioUrl: null,
    estimatedCompletion: "48 hours",
    executorType: "self",
    subcontractorName: null,
    envelopeAUrl: null,
    crewSizeOffered: 10,
    isBackhaul: false,
    bidSource: "web",
    status: "active",
    rank_status: "l1_leader",
    isHighlighted: true,
    milestone_count: 3,
    roundNumber: 1,
    fraudScore: 0,
    rankingScore: "94.50",
    createdAt: now,
  },
  {
    id: "b0000000-0000-0000-0000-000000000002",
    requirementId: "a0000000-0000-0000-0000-000000000001",
    requirement_id: "a0000000-0000-0000-0000-000000000001",
    providerId: "00000000-0000-0000-0000-000000000003",
    provider_id: "00000000-0000-0000-0000-000000000003",
    bidAmount: "2310000.00",
    bid_amount: "2310000.00",
    message: "Primary BIS 1786 certified Fe 550D rebars ex-Hyderabad depot with crane unloading included.",
    proposal_text: "Primary BIS 1786 certified Fe 550D rebars ex-Hyderabad depot with crane unloading included.",
    proofOfWork: "ISO 9001 certified regional steel distributor",
    portfolioUrl: null,
    estimatedCompletion: "60 hours",
    executorType: "self",
    subcontractorName: null,
    envelopeAUrl: null,
    crewSizeOffered: 6,
    isBackhaul: false,
    bidSource: "web",
    status: "active",
    rank_status: "l2",
    isHighlighted: false,
    milestone_count: 2,
    roundNumber: 1,
    fraudScore: 0,
    rankingScore: "89.00",
    createdAt: now,
  },
  {
    id: "b0000000-0000-0000-0000-000000000003",
    requirementId: "a0000000-0000-0000-0000-000000000003",
    requirement_id: "a0000000-0000-0000-0000-000000000003",
    providerId: "00000000-0000-0000-0000-000000000004",
    provider_id: "00000000-0000-0000-0000-000000000004",
    bidAmount: "765000.00",
    bid_amount: "765000.00",
    message: "Senior TypeScript + GSTN/NIC GSP certified team ready to deliver in 3 weekly milestones.",
    proposal_text: "Senior TypeScript + GSTN/NIC GSP certified team ready to deliver in 3 weekly milestones.",
    proofOfWork: "Delivered e-Way Bill sync for 4 logistics fleets",
    portfolioUrl: null,
    estimatedCompletion: "21 days",
    executorType: "self",
    subcontractorName: null,
    envelopeAUrl: null,
    crewSizeOffered: 4,
    isBackhaul: false,
    bidSource: "web",
    status: "active",
    rank_status: "l1_leader",
    isHighlighted: true,
    milestone_count: 3,
    roundNumber: 1,
    fraudScore: 0,
    rankingScore: "92.00",
    createdAt: now,
  },
  {
    id: "b0000000-0000-0000-0000-000000000004",
    requirementId: "a0000000-0000-0000-0000-000000000007",
    requirement_id: "a0000000-0000-0000-0000-000000000007",
    providerId: "00000000-0000-0000-0000-000000000003",
    provider_id: "00000000-0000-0000-0000-000000000003",
    bidAmount: "54000.00",
    bid_amount: "54000.00",
    message: "Grundfos pump calibration, brass manifold replacement, and 24-month leak warranty included.",
    proposal_text: "Grundfos pump calibration, brass manifold replacement, and 24-month leak warranty included.",
    proofOfWork: "Completed 40+ commercial hydro-pneumatic installations across Hyderabad",
    portfolioUrl: null,
    estimatedCompletion: "36 hours",
    executorType: "self",
    subcontractorName: null,
    envelopeAUrl: null,
    crewSizeOffered: 3,
    isBackhaul: false,
    bidSource: "web",
    status: "accepted",
    rank_status: "l1_leader",
    isHighlighted: false,
    milestone_count: 1,
    roundNumber: 1,
    fraudScore: 0,
    rankingScore: "95.00",
    createdAt: hoursFromNow(-60),
  },
  {
    id: "b0000000-0000-0000-0000-000000000005",
    requirementId: "a0000000-0000-0000-0000-000000000004",
    requirement_id: "a0000000-0000-0000-0000-000000000004",
    providerId: "00000000-0000-0000-0000-000000000003",
    provider_id: "00000000-0000-0000-0000-000000000003",
    bidAmount: "4050000.00",
    bid_amount: "4050000.00",
    message: "Initial quote for marine-grade structural steel fabrication and blasting at Vizag yard.",
    proposal_text: "Initial quote for marine-grade structural steel fabrication and blasting at Vizag yard.",
    proofOfWork: "ISO 3834 certified structural steel workshop",
    portfolioUrl: null,
    estimatedCompletion: "18 days",
    executorType: "self",
    subcontractorName: null,
    envelopeAUrl: null,
    crewSizeOffered: 12,
    isBackhaul: false,
    bidSource: "web",
    status: "active",
    rank_status: "l3",
    isHighlighted: false,
    milestone_count: 3,
    roundNumber: 1,
    fraudScore: 0,
    rankingScore: "84.00",
    createdAt: hoursFromNow(-24),
  },
  {
    id: "b0000000-0000-0000-0000-000000000006",
    requirementId: "a0000000-0000-0000-0000-000000000004",
    requirement_id: "a0000000-0000-0000-0000-000000000004",
    providerId: "00000000-0000-0000-0000-000000000004",
    provider_id: "00000000-0000-0000-0000-000000000004",
    bidAmount: "3890000.00",
    bid_amount: "3890000.00",
    message: "Direct coastal yard dispatch with ultrasonic weld NDT reports included.",
    proposal_text: "Direct coastal yard dispatch with ultrasonic weld NDT reports included.",
    proofOfWork: "Executed 3 berth crane steel packages at Paradip & Vizag",
    portfolioUrl: null,
    estimatedCompletion: "15 days",
    executorType: "self",
    subcontractorName: null,
    envelopeAUrl: null,
    crewSizeOffered: 16,
    isBackhaul: false,
    bidSource: "web",
    status: "active",
    rank_status: "l2",
    isHighlighted: false,
    milestone_count: 3,
    roundNumber: 1,
    fraudScore: 0,
    rankingScore: "90.00",
    createdAt: hoursFromNow(-14),
  },
  {
    id: "b0000000-0000-0000-0000-000000000007",
    requirementId: "a0000000-0000-0000-0000-000000000004",
    requirement_id: "a0000000-0000-0000-0000-000000000004",
    providerId: "00000000-0000-0000-0000-000000000003",
    provider_id: "00000000-0000-0000-0000-000000000003",
    bidAmount: "3720000.00",
    bid_amount: "3720000.00",
    message: "Revised reverse-auction quote optimizing plate nesting and epoxy primer sourcing.",
    proposal_text: "Revised reverse-auction quote optimizing plate nesting and epoxy primer sourcing.",
    proofOfWork: "ISO 3834 certified structural steel workshop",
    portfolioUrl: null,
    estimatedCompletion: "14 days",
    executorType: "self",
    subcontractorName: null,
    envelopeAUrl: null,
    crewSizeOffered: 14,
    isBackhaul: false,
    bidSource: "web",
    status: "active",
    rank_status: "l2",
    isHighlighted: false,
    milestone_count: 3,
    roundNumber: 1,
    fraudScore: 0,
    rankingScore: "92.00",
    createdAt: hoursFromNow(-6),
  },
  {
    id: "b0000000-0000-0000-0000-000000000008",
    requirementId: "a0000000-0000-0000-0000-000000000004",
    requirement_id: "a0000000-0000-0000-0000-000000000004",
    providerId: "00000000-0000-0000-0000-000000000004",
    provider_id: "00000000-0000-0000-0000-000000000004",
    bidAmount: "3580000.00",
    bid_amount: "3580000.00",
    message: "Final L1 reverse-auction offer with full marine epoxy coating and NABL inspection.",
    proposal_text: "Final L1 reverse-auction offer with full marine epoxy coating and NABL inspection.",
    proofOfWork: "Executed 3 berth crane steel packages at Paradip & Vizag",
    portfolioUrl: null,
    estimatedCompletion: "12 days",
    executorType: "self",
    subcontractorName: null,
    envelopeAUrl: null,
    crewSizeOffered: 18,
    isBackhaul: false,
    bidSource: "web",
    status: "active",
    rank_status: "l1_leader",
    isHighlighted: true,
    milestone_count: 3,
    roundNumber: 1,
    fraudScore: 0,
    rankingScore: "96.00",
    createdAt: hoursFromNow(-1),
  },
  {
    id: "b0000000-0000-0000-0000-000000000009",
    requirementId: "a0000000-0000-0000-0000-000000000005",
    requirement_id: "a0000000-0000-0000-0000-000000000005",
    providerId: "00000000-0000-0000-0000-000000000004",
    provider_id: "00000000-0000-0000-0000-000000000004",
    bidAmount: "138000.00",
    bid_amount: "138000.00",
    message: "Closed-body 32ft multi-axle fleet with GPS telematics and transit insurance.",
    proposal_text: "Closed-body 32ft multi-axle fleet with GPS telematics and transit insurance.",
    proofOfWork: "Daily Pune-Chennai auto corridor operator",
    portfolioUrl: null,
    estimatedCompletion: "24 hours",
    executorType: "self",
    subcontractorName: null,
    envelopeAUrl: null,
    crewSizeOffered: 2,
    isBackhaul: false,
    bidSource: "web",
    status: "active",
    rank_status: "l2",
    isHighlighted: false,
    milestone_count: 1,
    roundNumber: 1,
    fraudScore: 0,
    rankingScore: "87.00",
    createdAt: hoursFromNow(-8),
  },
  {
    id: "b0000000-0000-0000-0000-000000000010",
    requirementId: "a0000000-0000-0000-0000-000000000005",
    requirement_id: "a0000000-0000-0000-0000-000000000005",
    providerId: "00000000-0000-0000-0000-000000000003",
    provider_id: "00000000-0000-0000-0000-000000000003",
    bidAmount: "124500.00",
    bid_amount: "124500.00",
    message: "Return-route cancellation slot available tonight — direct express delivery to Sriperumbudur.",
    proposal_text: "Return-route cancellation slot available tonight — direct express delivery to Sriperumbudur.",
    proofOfWork: "Zero-damage automotive tier-1 freight SLA",
    portfolioUrl: null,
    estimatedCompletion: "18 hours",
    executorType: "self",
    subcontractorName: null,
    envelopeAUrl: null,
    crewSizeOffered: 2,
    isBackhaul: true,
    bidSource: "web",
    status: "active",
    rank_status: "l1_leader",
    isHighlighted: true,
    milestone_count: 1,
    roundNumber: 1,
    fraudScore: 0,
    rankingScore: "94.00",
    createdAt: hoursFromNow(-2),
  },
];

const SEED_SUBSCRIPTIONS = [
  {
    id: "c0000000-0000-0000-0000-000000000001",
    providerId: "00000000-0000-0000-0000-000000000003",
    plan: "starter",
    bidsRemaining: 28,
    createdAt: now,
  },
  {
    id: "c0000000-0000-0000-0000-000000000002",
    providerId: "00000000-0000-0000-0000-000000000004",
    plan: "pro",
    bidsRemaining: 999,
    createdAt: now,
  },
];

const SEED_PAYMENTS = [
  {
    id: "d0000000-0000-0000-0000-000000000001",
    requirementId: "a0000000-0000-0000-0000-000000000007",
    bidId: "b0000000-0000-0000-0000-000000000004",
    buyerId: "00000000-0000-0000-0000-000000000001",
    providerId: "00000000-0000-0000-0000-000000000003",
    totalAmount: "54000.00",
    platformFeePercent: "2.00",
    platformFeeAmount: "1080.00",
    tdsAmount: "1080.00",
    netToProvider: "51840.00",
    mobilizationAdvancePct: 0,
    advanceReleased: false,
    escrowStatus: "released",
    upiTransactionId: "pay_mock_completed_01",
    milestonesCompleted: 1,
    totalMilestones: 1,
    createdAt: hoursFromNow(-48),
    updatedAt: hoursFromNow(-24),
  },
];

const SEED_REVIEWS = [
  {
    id: "e0000000-0000-0000-0000-000000000001",
    requirementId: "a0000000-0000-0000-0000-000000000002",
    reviewerId: "00000000-0000-0000-0000-000000000002",
    revieweeId: "00000000-0000-0000-0000-000000000004",
    rating: 5,
    comment: "Delivered all scheduled batches ahead of timeline with complete lab test documentation.",
    createdAt: hoursFromNow(-48),
  },
  {
    id: "e0000000-0000-0000-0000-000000000002",
    requirementId: "a0000000-0000-0000-0000-000000000004",
    reviewerId: "00000000-0000-0000-0000-000000000099",
    revieweeId: "00000000-0000-0000-0000-000000000004",
    rating: 4,
    comment: "Strong technical execution and responsive site team; minor scheduling adjustment handled smoothly.",
    createdAt: hoursFromNow(-24),
  },
];

// Global singleton in-memory store across module reloads
const globalKey = "__omnibid_mock_store_v1__";
function getStore(): Map<string, any[]> {
  const g = globalThis as any;
  if (!g[globalKey]) {
    const store = new Map<string, any[]>();
    store.set("categories", [...SEED_CATEGORIES]);
    store.set("users", [...SEED_USERS]);
    store.set("requirements", [...SEED_REQUIREMENTS]);
    store.set("bids", [...SEED_BIDS]);
    store.set("provider_subscriptions", [...SEED_SUBSCRIPTIONS]);
    store.set("payments", [...SEED_PAYMENTS]);
    store.set("reviews", [...SEED_REVIEWS]);
    g[globalKey] = store;
  }
  return g[globalKey];
}

function getTableStore(table: any): any[] {
  let name = "unknown";
  try {
    name = typeof table === "string" ? table : getTableName(table);
  } catch {
    name = "unknown";
  }
  const store = getStore();
  if (!store.has(name)) {
    store.set(name, []);
  }
  return store.get(name)!;
}

function buildSqlColToJsMap(table: any): Record<string, string> {
  const map: Record<string, string> = {};
  if (!table || typeof table !== "object") return map;
  for (const [jsKey, colObj] of Object.entries(table)) {
    if (colObj && typeof colObj === "object" && "name" in colObj && typeof (colObj as any).name === "string") {
      map[(colObj as any).name] = jsKey;
    }
  }
  return map;
}

function evalCondition(cond: any, row: Record<string, any>, colMap: Record<string, string>): boolean {
  if (!cond) return true;
  try {
    const chunks = cond.queryChunks;
    if (!Array.isArray(chunks)) return true;

    // Check if top-level is an AND / OR group
    const stringText = chunks
      .filter((c: any) => c && Array.isArray(c.value))
      .map((c: any) => c.value.join(""))
      .join("|");

    // Extract nested SQL chunks for AND / OR
    const nestedSqls = chunks.filter((c: any) => c && Array.isArray(c.queryChunks));
    if (nestedSqls.length > 0) {
      if (stringText.includes(" or ")) {
        return nestedSqls.some((sub: any) => evalCondition(sub, row, colMap));
      }
      if (stringText.includes(" and ") || nestedSqls.length > 1) {
        return nestedSqls.every((sub: any) => evalCondition(sub, row, colMap));
      }
      if (nestedSqls.length === 1 && !chunks.some((c: any) => c && typeof c.name === "string" && "table" in c)) {
        return evalCondition(nestedSqls[0], row, colMap);
      }
    }

    // Simple binary comparison: [StringChunk(""), Column, StringChunk(" = "), Param(val), StringChunk("")]
    const colChunk = chunks.find((c: any) => c && typeof c.name === "string" && "table" in c);
    const paramChunk = chunks.find((c: any) => c && "value" in c && !Array.isArray(c.value) && "encoder" in c);
    const opChunk = chunks.find(
      (c: any) =>
        c &&
        Array.isArray(c.value) &&
        c.value.some((s: string) => s.trim().length > 0)
    );

    if (colChunk) {
      const sqlCol = colChunk.name;
      const jsKey = colMap[sqlCol] || sqlCol;
      const rowVal = row[jsKey] !== undefined ? row[jsKey] : row[sqlCol];
      const opStr = opChunk ? opChunk.value.join("").toLowerCase() : "";

      if (paramChunk) {
        const targetVal = paramChunk.value;
        if (opStr.includes("ilike") || opStr.includes("like")) {
          const pattern = String(targetVal).replace(/%/g, "").toLowerCase();
          return String(rowVal ?? "").toLowerCase().includes(pattern);
        }
        if (opStr.includes("<>") || opStr.includes("!=")) {
          return rowVal !== targetVal;
        }
        if (opStr.includes(">=")) {
          return rowVal >= targetVal;
        }
        if (opStr.includes("<=")) {
          return rowVal <= targetVal;
        }
        if (opStr.includes("=")) {
          return String(rowVal) === String(targetVal);
        }
      }
    }
  } catch {
    return true;
  }
  return true;
}

function isAggregateProjection(projection: any): boolean {
  if (!projection || typeof projection !== "object") return false;
  const aggKeys = new Set([
    "count",
    "total",
    "minBid",
    "maxBid",
    "avgBid",
    "avg",
    "min",
    "max",
    "sum",
    "totalBids",
    "totalSpend",
    "open",
    "accepted",
    "completed",
    "inProgress",
  ]);
  return Object.keys(projection).some((k) => aggKeys.has(k));
}

function computeAggregateRow(projection: Record<string, any>, rows: any[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(projection)) {
    if (key === "count" || key === "total" || key === "totalBids") {
      out[key] = rows.length;
    } else if (key === "open" || key === "accepted" || key === "completed" || key === "inProgress") {
      const targetStatus = key === "inProgress" ? "in_progress" : key;
      out[key] = rows.filter((r) => r.status === targetStatus).length;
    } else if (key === "minBid" || key === "min") {
      const nums = rows.map((r) => Number(r.bidAmount ?? r.bid_amount)).filter((n) => !Number.isNaN(n));
      out[key] = nums.length ? String(Math.min(...nums)) : null;
    } else if (key === "maxBid" || key === "max") {
      const nums = rows.map((r) => Number(r.bidAmount ?? r.bid_amount)).filter((n) => !Number.isNaN(n));
      out[key] = nums.length ? String(Math.max(...nums)) : null;
    } else if (key === "avgBid" || key === "avg") {
      const nums = rows.map((r) => Number(r.bidAmount ?? r.bid_amount ?? r.rating)).filter((n) => !Number.isNaN(n));
      out[key] = nums.length ? String(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
    } else if (key === "totalSpend" || key === "sum") {
      out[key] = "0";
    } else {
      out[key] = 0;
    }
  }
  return out;
}

function makeChainableQuery(executor: () => Promise<any>) {
  const chain: any = {
    from: (t: any) => chain._setTable(t),
    where: (c: any) => chain._setWhere(c),
    orderBy: () => chain,
    limit: (n: number) => chain._setLimit(n),
    offset: (n: number) => chain._setOffset(n),
    leftJoin: () => chain,
    innerJoin: () => chain,
    groupBy: () => chain,
    having: () => chain,
    values: (v: any) => chain._setValues(v),
    set: (v: any) => chain._setValues(v),
    returning: () => chain,
    onConflictDoNothing: () => chain,
    onConflictDoUpdate: () => chain,
    then: (onFulfilled: any, onRejected: any) => executor().then(onFulfilled, onRejected),
    catch: (onRejected: any) => executor().catch(onRejected),
    finally: (onFinally: any) => executor().finally(onFinally),
  };
  return chain;
}

export function createMockDb() {
  console.warn("[AI Studio] Database offline or unconfigured — using in-memory seeded Drizzle mock");

  const dbApi: any = {
    select(projection?: Record<string, any>) {
      let targetTable: any = null;
      let whereCond: any = null;
      let limitVal: number | null = null;
      let offsetVal = 0;

      const exec = async () => {
        if (!targetTable) return [];
        const allRows = getTableStore(targetTable);
        const colMap = buildSqlColToJsMap(targetTable);
        let filtered = whereCond
          ? allRows.filter((r) => evalCondition(whereCond, r, colMap))
          : [...allRows];

        if (isAggregateProjection(projection)) {
          return [computeAggregateRow(projection!, filtered)];
        }

        if (offsetVal > 0) filtered = filtered.slice(offsetVal);
        if (limitVal !== null) filtered = filtered.slice(0, limitVal);

        // Handle joined object projection like { bid: bids, provider: users }
        if (projection && typeof projection === "object") {
          const projValues = Object.values(projection);
          const hasTableRef = projValues.some(
            (v: any) => v && typeof v === "object" && Symbol.for("drizzle:Name") in v
          );
          if (hasTableRef) {
            const usersRows = getStore().get("users") || [];
            return filtered.map((r) => {
              const out: Record<string, any> = {};
              for (const [k, v] of Object.entries(projection)) {
                if (k === "provider" || k === "user" || k === "buyer") {
                  const uid = r.providerId ?? r.provider_id ?? r.buyerId ?? r.buyer_id ?? r.userId;
                  out[k] = usersRows.find((u) => u.id === uid) || usersRows[0] || null;
                } else {
                  out[k] = r;
                }
              }
              return out;
            });
          }
        }

        return filtered;
      };

      const q = makeChainableQuery(exec);
      q._setTable = (t: any) => { targetTable = t; return q; };
      q._setWhere = (c: any) => { whereCond = c; return q; };
      q._setLimit = (n: number) => { limitVal = n; return q; };
      q._setOffset = (n: number) => { offsetVal = n; return q; };
      return q;
    },

    insert(targetTable: any) {
      let vals: any = null;
      const exec = async () => {
        const rows = getTableStore(targetTable);
        const list = Array.isArray(vals) ? vals : [vals];
        const inserted: any[] = [];
        for (const item of list) {
          if (!item) continue;
          const record = {
            id: item.id || crypto.randomUUID(),
            createdAt: item.createdAt || new Date(),
            created_at: item.created_at || new Date(),
            status: item.status || "open",
            trustScore: item.trustScore ?? 50,
            isVerified: item.isVerified ?? false,
            aadhaarVerified: item.aadhaarVerified ?? false,
            kycStatus: item.kycStatus ?? "pending",
            isHighTicket: item.isHighTicket ?? false,
            isMegaProject: item.isMegaProject ?? false,
            isSyndicate: item.isSyndicate ?? false,
            jugaadMode: item.jugaadMode ?? false,
            isRecurring: item.isRecurring ?? false,
            depositPaid: item.depositPaid ?? false,
            isHighlighted: item.isHighlighted ?? false,
            ...item,
          };
          if (!rows.some((r) => r.id === record.id)) {
            rows.unshift(record);
          }
          inserted.push(record);
        }
        return inserted;
      };

      const q = makeChainableQuery(exec);
      q._setValues = (v: any) => { vals = v; return q; };
      return q;
    },

    update(targetTable: any) {
      let vals: any = {};
      let whereCond: any = null;
      const exec = async () => {
        const rows = getTableStore(targetTable);
        const colMap = buildSqlColToJsMap(targetTable);
        const matched = whereCond
          ? rows.filter((r) => evalCondition(whereCond, r, colMap))
          : rows;
        for (const r of matched) {
          Object.assign(r, vals);
        }
        return matched.length ? matched : [{ ...vals }];
      };

      const q = makeChainableQuery(exec);
      q._setValues = (v: any) => { vals = v; return q; };
      q._setWhere = (c: any) => { whereCond = c; return q; };
      return q;
    },

    delete(targetTable: any) {
      let whereCond: any = null;
      const exec = async () => {
        const store = getStore();
        let name = "unknown";
        try { name = getTableName(targetTable); } catch {}
        const rows = store.get(name) || [];
        const colMap = buildSqlColToJsMap(targetTable);
        if (whereCond) {
          const kept = rows.filter((r) => !evalCondition(whereCond, r, colMap));
          store.set(name, kept);
        }
        return [];
      };

      const q = makeChainableQuery(exec);
      q._setWhere = (c: any) => { whereCond = c; return q; };
      return q;
    },

    execute: async () => ({ rows: [] }),
    transaction: async (fn: (tx: any) => Promise<any>) => fn(dbApi),
    query: new Proxy(
      {},
      {
        get: (_target, tableKey: string) => ({
          findMany: async () => getStore().get(tableKey) || [],
          findFirst: async () => (getStore().get(tableKey) || [])[0] ?? null,
        }),
      }
    ),
  };

  return dbApi;
}
