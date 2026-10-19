/**
 * GSTIN Validation & Section 194C TDS Calculation Utilities for OmniBid India (Client Library)
 * Compliant with Indian GST Standards and Income Tax Act 1961 (Section 194C / Form 16A)
 */

export const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const GSTIN_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (Old)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

export const PAN_ENTITY_TYPES: Record<string, string> = {
  P: "Individual / Proprietor / HUF",
  C: "Company",
  H: "Hindu Undivided Family (HUF)",
  F: "Firm / Limited Liability Partnership (LLP)",
  A: "Association of Persons (AOP)",
  T: "Trust",
  B: "Body of Individuals (BOI)",
  L: "Local Authority",
  J: "Artificial Juridical Person",
  G: "Government Entity",
};

/**
 * Computes the 15th checksum character using standard GSTN Mod-36 algorithm.
 * Multipliers alternate: 1, 2, 1, 2... from left to right across first 14 characters.
 */
export function calculateGstinChecksum(first14Chars: string): string {
  if (!first14Chars || first14Chars.length !== 14) {
    throw new Error("First 14 characters required for GSTIN checksum calculation");
  }

  const clean = first14Chars.toUpperCase();
  let sum = 0;

  for (let i = 0; i < 14; i++) {
    const codePoint = GSTIN_CHARS.indexOf(clean[i]);
    if (codePoint === -1) {
      throw new Error(`Invalid character '${clean[i]}' in GSTIN at index ${i}`);
    }
    const factor = i % 2 === 0 ? 1 : 2;
    const product = codePoint * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }

  const remainder = sum % 36;
  const checkCodePoint = (36 - remainder) % 36;
  return GSTIN_CHARS[checkCodePoint];
}

/**
 * Secondary checksum calculator using right-to-left weighting factor (ISO/IEC 7064 variant)
 */
export function calculateGstinChecksumAlt(first14Chars: string): string {
  const clean = first14Chars.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const codePoint = GSTIN_CHARS.indexOf(clean[i]);
    if (codePoint === -1) return "";
    const factor = (14 - i) % 2 === 0 ? 2 : 1;
    const product = codePoint * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const remainder = sum % 36;
  const checkCodePoint = (36 - remainder) % 36;
  return GSTIN_CHARS[checkCodePoint];
}

export interface GstinValidationResult {
  isValid: boolean;
  gstin?: string;
  stateCode?: string;
  stateName?: string;
  pan?: string;
  entityType?: string;
  entityCategory?: "individual" | "company" | "other";
  tdsRate: number; // 0.01 (1%) or 0.02 (2%) under Section 194C
  error?: string;
}

/**
 * Validates a 15-digit GSTIN according to Indian GST standards.
 * Verifies format, state code, PAN structure, and Mod-36 checksum.
 */
export function validateGSTIN(rawGstin: string): GstinValidationResult {
  if (!rawGstin || typeof rawGstin !== "string") {
    return { isValid: false, tdsRate: 0.02, error: "GSTIN is required" };
  }

  const gstin = rawGstin.trim().toUpperCase();

  if (gstin.length !== 15) {
    return {
      isValid: false,
      tdsRate: 0.02,
      error: `GSTIN must be exactly 15 characters (got ${gstin.length})`,
    };
  }

  // Basic regex check: 2 digits + 5 letters + 4 digits + 1 letter + 1 char + Z + 1 char
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(gstin)) {
    return {
      isValid: false,
      tdsRate: 0.02,
      error: "GSTIN format is invalid (expected 2-digit state code, 10-char PAN, 1-char entity, 'Z', 1-char checksum)",
    };
  }

  const stateCode = gstin.substring(0, 2);
  const stateName = GSTIN_STATE_CODES[stateCode];
  if (!stateName) {
    return {
      isValid: false,
      tdsRate: 0.02,
      error: `Invalid state code '${stateCode}' in GSTIN`,
    };
  }

  // Extract embedded 10-char PAN (chars 3 to 12 -> slice(2, 12))
  const pan = gstin.substring(2, 12);
  const fourthChar = pan.charAt(3);
  const entityType = PAN_ENTITY_TYPES[fourthChar] || "Other Legal Entity";
  const isIndividual = fourthChar === "P" || fourthChar === "H";
  const entityCategory: "individual" | "company" | "other" = isIndividual
    ? "individual"
    : fourthChar === "C" || fourthChar === "F"
    ? "company"
    : "other";

  // Section 194C: 1% for Individual/HUF, 2% for Company/LLP/Others
  const tdsRate = isIndividual ? 0.01 : 0.02;

  // Validate Mod-36 checksum
  const expectedCheck1 = calculateGstinChecksum(gstin.substring(0, 14));
  const expectedCheck2 = calculateGstinChecksumAlt(gstin.substring(0, 14));
  const actualCheck = gstin.charAt(14);

  if (actualCheck !== expectedCheck1 && actualCheck !== expectedCheck2) {
    return {
      isValid: false,
      gstin,
      stateCode,
      stateName,
      pan,
      entityType,
      entityCategory,
      tdsRate,
      error: `Checksum digit mismatch: expected '${expectedCheck1}', found '${actualCheck}'`,
    };
  }

  return {
    isValid: true,
    gstin,
    stateCode,
    stateName,
    pan,
    entityType,
    entityCategory,
    tdsRate,
  };
}

/**
 * Validates a 10-character PAN number and determines Section 194C TDS rate.
 */
export function validatePAN(rawPan: string): {
  isValid: boolean;
  pan?: string;
  fourthChar?: string;
  entityType?: string;
  tdsRate: number;
  error?: string;
} {
  if (!rawPan || typeof rawPan !== "string") {
    return { isValid: false, tdsRate: 0.02, error: "PAN is required" };
  }

  const pan = rawPan.trim().toUpperCase();
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(pan)) {
    return { isValid: false, tdsRate: 0.02, error: "Invalid PAN format (expected 5 letters, 4 digits, 1 letter)" };
  }

  const fourthChar = pan.charAt(3);
  const entityType = PAN_ENTITY_TYPES[fourthChar] || "Other Entity";
  const isIndividual = fourthChar === "P" || fourthChar === "H";
  const tdsRate = isIndividual ? 0.01 : 0.02;

  return {
    isValid: true,
    pan,
    fourthChar,
    entityType,
    tdsRate,
  };
}

export interface EscrowBreakdownParams {
  grossAmountInr: number;
  gstinOrPan?: string | null;
}

export interface EscrowBreakdownResult {
  validGstin: boolean;
  stateName: string;
  pan: string;
  entityType: string;
  tdsRate: number;
  platformFeeRate: number;
  grossAmountInr: number;
  platformFeeInr: number;
  tdsInr: number;
  netSettlementInr: number;
}

/**
 * Calculates complete Indian procurement escrow breakdown:
 * - 2% Platform Fee (OmniBid India)
 * - Section 194C TDS (1% for Individual/HUF, 2% for Company/LLP)
 * - Exemption threshold: Gross amount <= ₹30,000 has 0% TDS
 * - Net Settlement = Gross - Platform Fee - TDS
 */
export function calculateEscrowBreakdown(params: EscrowBreakdownParams): EscrowBreakdownResult {
  const { grossAmountInr, gstinOrPan } = params;
  const gross = Math.max(0, Number(grossAmountInr) || 0);

  let validGstin = false;
  let stateName = "Pan-India";
  let pan = "";
  let entityType = "Registered Contractor / Company";
  let tdsRate = 0.02; // Default to 2% for corporate/unspecified

  if (gstinOrPan && typeof gstinOrPan === "string") {
    const cleanInput = gstinOrPan.trim().toUpperCase();

    if (cleanInput.length === 15) {
      const gstinResult = validateGSTIN(cleanInput);
      validGstin = gstinResult.isValid;
      if (gstinResult.stateName) stateName = gstinResult.stateName;
      if (gstinResult.pan) pan = gstinResult.pan;
      if (gstinResult.entityType) entityType = gstinResult.entityType;
      tdsRate = gstinResult.tdsRate;
    } else if (cleanInput.length === 10) {
      const panResult = validatePAN(cleanInput);
      if (panResult.isValid) {
        pan = panResult.pan!;
        if (panResult.entityType) entityType = panResult.entityType;
        tdsRate = panResult.tdsRate;
      }
    }
  }

  // Statutory exemption threshold under Section 194C: single contract <= ₹30,000 has 0% TDS
  const isTdsExempt = gross <= 30000;
  const effectiveTdsRate = isTdsExempt ? 0 : tdsRate;

  const platformFeeRate = 0.02; // 2% platform fee
  const platformFeeInr = Math.round(gross * platformFeeRate * 100) / 100;
  const tdsInr = isTdsExempt ? 0 : Math.round(gross * effectiveTdsRate * 100) / 100;
  const netSettlementInr = Math.round((gross - platformFeeInr - tdsInr) * 100) / 100;

  return {
    validGstin,
    stateName,
    pan,
    entityType,
    tdsRate: effectiveTdsRate,
    platformFeeRate,
    grossAmountInr: gross,
    platformFeeInr,
    tdsInr,
    netSettlementInr,
  };
}
