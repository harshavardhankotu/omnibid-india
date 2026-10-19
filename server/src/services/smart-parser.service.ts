/**
 * Smart Procurement & WhatsApp BOQ Parser with India Post PIN Code Resolver
 * Parses unstructured buyer/contractor chat messages into structured tenders.
 */

export interface PinLookupResult {
  pincode: string;
  city: string;
  state: string;
  region?: string;
  valid: boolean;
}

// 3-digit high-resolution industrial and commercial hub mappings
const PIN_3_DIGIT_MAP: Record<string, { city: string; state: string; region?: string }> = {
  "110": { city: "New Delhi", state: "Delhi", region: "National Capital Region" },
  "121": { city: "Faridabad", state: "Haryana", region: "NCR" },
  "122": { city: "Gurugram", state: "Haryana", region: "NCR" },
  "131": { city: "Sonipat", state: "Haryana" },
  "132": { city: "Panipat", state: "Haryana" },
  "133": { city: "Ambala", state: "Haryana" },
  "134": { city: "Panchkula", state: "Haryana" },
  "140": { city: "Mohali", state: "Punjab" },
  "141": { city: "Ludhiana", state: "Punjab" },
  "143": { city: "Amritsar", state: "Punjab" },
  "144": { city: "Jalandhar", state: "Punjab" },
  "147": { city: "Patiala", state: "Punjab" },
  "160": { city: "Chandigarh", state: "Chandigarh" },
  "201": { city: "Noida", state: "Uttar Pradesh", region: "NCR" },
  "202": { city: "Aligarh", state: "Uttar Pradesh" },
  "208": { city: "Kanpur", state: "Uttar Pradesh" },
  "211": { city: "Prayagraj", state: "Uttar Pradesh" },
  "221": { city: "Varanasi", state: "Uttar Pradesh" },
  "226": { city: "Lucknow", state: "Uttar Pradesh" },
  "248": { city: "Dehradun", state: "Uttarakhand" },
  "249": { city: "Haridwar", state: "Uttarakhand" },
  "302": { city: "Jaipur", state: "Rajasthan" },
  "305": { city: "Ajmer", state: "Rajasthan" },
  "313": { city: "Udaipur", state: "Rajasthan" },
  "342": { city: "Jodhpur", state: "Rajasthan" },
  "380": { city: "Ahmedabad", state: "Gujarat" },
  "382": { city: "Gandhinagar", state: "Gujarat" },
  "390": { city: "Vadodara", state: "Gujarat" },
  "395": { city: "Surat", state: "Gujarat" },
  "360": { city: "Rajkot", state: "Gujarat" },
  "400": { city: "Mumbai", state: "Maharashtra", region: "MMR" },
  "401": { city: "Thane", state: "Maharashtra", region: "MMR" },
  "410": { city: "Navi Mumbai", state: "Maharashtra", region: "MMR" },
  "411": { city: "Pune", state: "Maharashtra" },
  "414": { city: "Ahmednagar", state: "Maharashtra" },
  "416": { city: "Kolhapur", state: "Maharashtra" },
  "421": { city: "Kalyan", state: "Maharashtra", region: "MMR" },
  "422": { city: "Nashik", state: "Maharashtra" },
  "431": { city: "Chhatrapati Sambhajinagar", state: "Maharashtra" },
  "440": { city: "Nagpur", state: "Maharashtra" },
  "452": { city: "Indore", state: "Madhya Pradesh" },
  "462": { city: "Bhopal", state: "Madhya Pradesh" },
  "474": { city: "Gwalior", state: "Madhya Pradesh" },
  "482": { city: "Jabalpur", state: "Madhya Pradesh" },
  "490": { city: "Bhilai", state: "Chhattisgarh" },
  "492": { city: "Raipur", state: "Chhattisgarh" },
  "500": { city: "Hyderabad", state: "Telangana" },
  "501": { city: "Ranga Reddy", state: "Telangana" },
  "502": { city: "Sangareddy", state: "Telangana" },
  "505": { city: "Karimnagar", state: "Telangana" },
  "506": { city: "Warangal", state: "Telangana" },
  "520": { city: "Vijayawada", state: "Andhra Pradesh" },
  "522": { city: "Guntur", state: "Andhra Pradesh" },
  "530": { city: "Visakhapatnam", state: "Andhra Pradesh" },
  "533": { city: "Kakinada", state: "Andhra Pradesh" },
  "560": { city: "Bengaluru", state: "Karnataka" },
  "562": { city: "Bengaluru Rural", state: "Karnataka" },
  "570": { city: "Mysuru", state: "Karnataka" },
  "575": { city: "Mangaluru", state: "Karnataka" },
  "580": { city: "Hubballi-Dharwad", state: "Karnataka" },
  "590": { city: "Belagavi", state: "Karnataka" },
  "600": { city: "Chennai", state: "Tamil Nadu" },
  "603": { city: "Kanchipuram", state: "Tamil Nadu" },
  "625": { city: "Madurai", state: "Tamil Nadu" },
  "636": { city: "Salem", state: "Tamil Nadu" },
  "641": { city: "Coimbatore", state: "Tamil Nadu" },
  "642": { city: "Pollachi", state: "Tamil Nadu" },
  "670": { city: "Kannur", state: "Kerala" },
  "673": { city: "Kozhikode", state: "Kerala" },
  "680": { city: "Thrissur", state: "Kerala" },
  "682": { city: "Kochi", state: "Kerala" },
  "695": { city: "Thiruvananthapuram", state: "Kerala" },
  "700": { city: "Kolkata", state: "West Bengal" },
  "711": { city: "Howrah", state: "West Bengal" },
  "713": { city: "Durgapur", state: "West Bengal" },
  "734": { city: "Siliguri", state: "West Bengal" },
  "751": { city: "Bhubaneswar", state: "Odisha" },
  "753": { city: "Cuttack", state: "Odisha" },
  "769": { city: "Rourkela", state: "Odisha" },
  "781": { city: "Guwahati", state: "Assam" },
  "799": { city: "Agartala", state: "Tripura" },
  "800": { city: "Patna", state: "Bihar" },
  "812": { city: "Bhagalpur", state: "Bihar" },
  "826": { city: "Dhanbad", state: "Jharkhand" },
  "831": { city: "Jamshedpur", state: "Jharkhand" },
  "834": { city: "Ranchi", state: "Jharkhand" },
  "842": { city: "Muzaffarpur", state: "Bihar" },
};

// 2-digit fallback state zone mapping
const PIN_2_DIGIT_MAP: Record<string, { city: string; state: string }> = {
  "11": { city: "New Delhi", state: "Delhi" },
  "12": { city: "Faridabad/Gurugram", state: "Haryana" },
  "13": { city: "Ambala/Panipat", state: "Haryana" },
  "14": { city: "Ludhiana/Amritsar", state: "Punjab" },
  "15": { city: "Bathinda", state: "Punjab" },
  "16": { city: "Chandigarh", state: "Chandigarh" },
  "17": { city: "Shimla", state: "Himachal Pradesh" },
  "18": { city: "Jammu", state: "Jammu & Kashmir" },
  "19": { city: "Srinagar", state: "Jammu & Kashmir" },
  "20": { city: "Noida/Ghaziabad", state: "Uttar Pradesh" },
  "21": { city: "Prayagraj", state: "Uttar Pradesh" },
  "22": { city: "Lucknow/Varanasi", state: "Uttar Pradesh" },
  "23": { city: "Mirzapur", state: "Uttar Pradesh" },
  "24": { city: "Dehradun/Moradabad", state: "Uttar Pradesh" },
  "25": { city: "Meerut", state: "Uttar Pradesh" },
  "26": { city: "Bareilly", state: "Uttar Pradesh" },
  "27": { city: "Gorakhpur", state: "Uttar Pradesh" },
  "28": { city: "Agra", state: "Uttar Pradesh" },
  "30": { city: "Jaipur", state: "Rajasthan" },
  "31": { city: "Udaipur", state: "Rajasthan" },
  "32": { city: "Kota", state: "Rajasthan" },
  "33": { city: "Bikaner", state: "Rajasthan" },
  "34": { city: "Jodhpur", state: "Rajasthan" },
  "36": { city: "Rajkot", state: "Gujarat" },
  "37": { city: "Bhuj", state: "Gujarat" },
  "38": { city: "Ahmedabad", state: "Gujarat" },
  "39": { city: "Surat/Vadodara", state: "Gujarat" },
  "40": { city: "Mumbai", state: "Maharashtra" },
  "41": { city: "Pune", state: "Maharashtra" },
  "42": { city: "Nashik", state: "Maharashtra" },
  "43": { city: "Aurangabad", state: "Maharashtra" },
  "44": { city: "Nagpur", state: "Maharashtra" },
  "45": { city: "Indore", state: "Madhya Pradesh" },
  "46": { city: "Bhopal", state: "Madhya Pradesh" },
  "47": { city: "Gwalior", state: "Madhya Pradesh" },
  "48": { city: "Jabalpur", state: "Madhya Pradesh" },
  "49": { city: "Raipur", state: "Chhattisgarh" },
  "50": { city: "Hyderabad", state: "Telangana" },
  "51": { city: "Tirupati/Kurnool", state: "Andhra Pradesh" },
  "52": { city: "Vijayawada/Guntur", state: "Andhra Pradesh" },
  "53": { city: "Visakhapatnam", state: "Andhra Pradesh" },
  "56": { city: "Bengaluru", state: "Karnataka" },
  "57": { city: "Mangaluru/Mysuru", state: "Karnataka" },
  "58": { city: "Hubballi/Kalaburagi", state: "Karnataka" },
  "59": { city: "Belagavi", state: "Karnataka" },
  "60": { city: "Chennai", state: "Tamil Nadu" },
  "61": { city: "Tiruchirappalli", state: "Tamil Nadu" },
  "62": { city: "Madurai", state: "Tamil Nadu" },
  "63": { city: "Vellore", state: "Tamil Nadu" },
  "64": { city: "Coimbatore", state: "Tamil Nadu" },
  "67": { city: "Kozhikode/Kannur", state: "Kerala" },
  "68": { city: "Kochi/Thrissur", state: "Kerala" },
  "69": { city: "Thiruvananthapuram", state: "Kerala" },
  "70": { city: "Kolkata", state: "West Bengal" },
  "71": { city: "Howrah/Burdwan", state: "West Bengal" },
  "72": { city: "Midnapore", state: "West Bengal" },
  "73": { city: "Siliguri", state: "West Bengal" },
  "74": { city: "Nadia/North 24 Parganas", state: "West Bengal" },
  "75": { city: "Bhubaneswar/Cuttack", state: "Odisha" },
  "76": { city: "Berhampur", state: "Odisha" },
  "77": { city: "Sambalpur", state: "Odisha" },
  "78": { city: "Guwahati", state: "Assam" },
  "79": { city: "Shillong/Agartala", state: "North East" },
  "80": { city: "Patna", state: "Bihar" },
  "81": { city: "Bhagalpur", state: "Bihar" },
  "82": { city: "Dhanbad/Bokaro", state: "Jharkhand" },
  "83": { city: "Ranchi/Jamshedpur", state: "Jharkhand" },
  "84": { city: "Muzaffarpur", state: "Bihar" },
  "85": { city: "Purnia", state: "Bihar" },
};

/**
 * Resolves a 6-digit Indian PIN code to City & State.
 */
export function lookupPinCode(pincode: string): PinLookupResult {
  const clean = (pincode || "").trim();
  if (!/^[1-9][0-9]{5}$/.test(clean)) {
    return {
      pincode: clean,
      city: "",
      state: "",
      valid: false,
    };
  }

  const prefix3 = clean.substring(0, 3);
  if (PIN_3_DIGIT_MAP[prefix3]) {
    const entry = PIN_3_DIGIT_MAP[prefix3];
    return {
      pincode: clean,
      city: entry.city,
      state: entry.state,
      region: entry.region,
      valid: true,
    };
  }

  const prefix2 = clean.substring(0, 2);
  if (PIN_2_DIGIT_MAP[prefix2]) {
    const entry = PIN_2_DIGIT_MAP[prefix2];
    return {
      pincode: clean,
      city: entry.city,
      state: entry.state,
      valid: true,
    };
  }

  return {
    pincode: clean,
    city: "India",
    state: "India",
    valid: true,
  };
}

/**
 * Parses Indian currency notation into standard number (INR).
 * Handles: 1.9L, 12 Lakhs, 50K, 2.5 Cr, ₹1,90,000, 190000
 */
export function parseIndianBudget(text: string): number | null {
  if (!text) return null;

  // Regex for Crore e.g. 2.5 Cr, 1.2 Crore, 3 Crores
  const crMatch = text.match(/(?:budget|estimate|cost|price|ceiling|inr|rs\.?|₹)?\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:cr|crore|crores)\b/i);
  if (crMatch) {
    return Math.round(parseFloat(crMatch[1]) * 10000000);
  }

  // Regex for Lakh e.g. 1.9L, 12 Lakhs, 4.5 lac, 5 lacs
  const lakhMatch = text.match(/(?:budget|estimate|cost|price|ceiling|inr|rs\.?|₹)?\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:l|lac|lakh|lakhs|lacs)\b/i);
  if (lakhMatch) {
    return Math.round(parseFloat(lakhMatch[1]) * 100000);
  }

  // Regex for K e.g. 50K, 75 k
  const kMatch = text.match(/(?:budget|estimate|cost|price|ceiling|inr|rs\.?|₹)?\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:k|thousand)\b/i);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1]) * 1000);
  }

  // Regex for explicitly tagged INR formats e.g. "budget 1,90,000" or "₹ 1,90,000" or "Rs. 250000"
  const formattedMatch = text.match(/(?:budget|ceiling|cost|inr|rs\.?|₹)\s*[:=-]?\s*₹?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]{4,10})/i);
  if (formattedMatch) {
    const rawNum = formattedMatch[1].replace(/,/g, "");
    const val = parseFloat(rawNum);
    if (!isNaN(val) && val > 0) return Math.round(val);
  }

  return null;
}

/**
 * Extracts quantity and canonical unit from text.
 * Canonical units: MT, tons, bags, sqft, brass, pieces, meters, kg
 */
export function parseQuantityAndUnit(text: string): { quantity: number | null; unit: string | null } {
  if (!text) return { quantity: null, unit: null };

  const unitPatterns = [
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:mt|metric\s*tons?|tonnes?)\b/i, unit: "MT" },
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:tons?)\b/i, unit: "tons" },
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:bags?|bgs?)\b/i, unit: "bags" },
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:sqft|sq\.?\s*ft|square\s*feet|sft)\b/i, unit: "sqft" },
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:brass)\b/i, unit: "brass" },
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:pieces?|pcs?|nos?|units?)\b/i, unit: "pieces" },
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:meters?|mtrs?|mtr|m)\b/i, unit: "meters" },
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:kgs?|kilograms?)\b/i, unit: "kg" },
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:quintals?|qtl)\b/i, unit: "quintals" },
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:cum|cu\.?m|cubic\s*meters?)\b/i, unit: "cum" },
    { regex: /\b([0-9]+(?:\.[0-9]+)?)\s*(?:trips?|loads?)\b/i, unit: "trips" },
  ];

  for (const { regex, unit } of unitPatterns) {
    const match = text.match(regex);
    if (match) {
      return {
        quantity: parseFloat(match[1]),
        unit,
      };
    }
  }

  return { quantity: null, unit: null };
}

/**
 * Detects Indian construction & commercial procurement category.
 */
export function detectCategory(text: string): string {
  const lower = text.toLowerCase();

  if (/cement|opc|ppc|ultratech|acc|ambuja|dalmia|shree\s*cement/i.test(lower)) {
    return "Cement & Concrete";
  }
  if (/steel|tmt|rebar|iron|jsw|tata\s*tiscon|sail|ms\s*angle|structural|beam|channel/i.test(lower)) {
    return "Steel & Structural Metals";
  }
  if (/sand|m-sand|msand|river\s*sand|aggregate|gravel|crushed\s*stone|jelly/i.test(lower)) {
    return "Aggregates & Sand";
  }
  if (/bricks?|aac\s*blocks?|fly\s*ash|red\s*bricks?|solid\s*blocks?/i.test(lower)) {
    return "Bricks & Masonry";
  }
  if (/tiles?|granite|marble|vitrified|flooring|kota\s*stone/i.test(lower)) {
    return "Flooring & Tiles";
  }
  if (/electrical|wire|wires|cables?|havells|polycab|conduit|switch|transformer/i.test(lower)) {
    return "Electrical & Wiring";
  }
  if (/plumbing|pipes?|pvc|cpvc|upvc|astral|ashirvad|sanitary|fittings?/i.test(lower)) {
    return "Plumbing & Sanitary";
  }
  if (/paint|asian\s*paints|berger|primer|putty|waterproofing|dr\s*fixit/i.test(lower)) {
    return "Paints & Waterproofing";
  }
  if (/jcb|crane|excavator|tipper|machinery|equipment|transit\s*mixer|roller/i.test(lower)) {
    return "Machinery & Equipment Rental";
  }
  if (/transport|logistics|truck|freight|trailer|backhaul|tempo/i.test(lower)) {
    return "Logistics & Transport";
  }
  if (/solar|panels?|inverter|rooftop\s*solar/i.test(lower)) {
    return "Renewable Energy & Solar";
  }

  return "Civil Construction & Raw Materials";
}

export interface SmartParseResult {
  title: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  budgetInr: number | null;
  pincode: string | null;
  city: string;
  state: string;
  rawText: string;
  matchedAffiliateOffers?: any[];
}

/**
 * Main parser entry point: Parses unstructured message into structured tender requirement.
 */
export function parseSmartProcurementText(text: string): SmartParseResult {
  const clean = (text || "").trim();

  // 1. Extract PIN Code
  const pinMatch = clean.match(/\b([1-9][0-9]{5})\b/);
  const pincode = pinMatch ? pinMatch[1] : null;

  let city = "";
  let state = "";

  if (pincode) {
    const pinData = lookupPinCode(pincode);
    city = pinData.city;
    state = pinData.state;
  }

  // Fallback to checking popular cities in text if not resolved by PIN
  if (!city) {
    const popularCities = [
      { name: "Hyderabad", state: "Telangana" },
      { name: "Bengaluru", state: "Karnataka" },
      { name: "Bangalore", state: "Karnataka" },
      { name: "Mumbai", state: "Maharashtra" },
      { name: "Pune", state: "Maharashtra" },
      { name: "Delhi", state: "Delhi" },
      { name: "New Delhi", state: "Delhi" },
      { name: "Noida", state: "Uttar Pradesh" },
      { name: "Gurugram", state: "Haryana" },
      { name: "Gurgaon", state: "Haryana" },
      { name: "Chennai", state: "Tamil Nadu" },
      { name: "Kolkata", state: "West Bengal" },
      { name: "Ahmedabad", state: "Gujarat" },
      { name: "Surat", state: "Gujarat" },
      { name: "Jaipur", state: "Rajasthan" },
      { name: "Lucknow", state: "Uttar Pradesh" },
      { name: "Visakhapatnam", state: "Andhra Pradesh" },
      { name: "Vijayawada", state: "Andhra Pradesh" },
      { name: "Nagpur", state: "Maharashtra" },
      { name: "Indore", state: "Madhya Pradesh" },
      { name: "Bhopal", state: "Madhya Pradesh" },
      { name: "Chandigarh", state: "Chandigarh" },
      { name: "Patna", state: "Bihar" },
      { name: "Ranchi", state: "Jharkhand" },
    ];

    for (const c of popularCities) {
      if (new RegExp(`\\b${c.name}\\b`, "i").test(clean)) {
        city = c.name === "Bangalore" ? "Bengaluru" : c.name === "Gurgaon" ? "Gurugram" : c.name;
        state = c.state;
        break;
      }
    }
  }

  if (!city) city = "Pan-India";
  if (!state) state = "India";

  // 2. Extract Category
  const category = detectCategory(clean);

  // 3. Extract Quantity and Unit
  const { quantity, unit } = parseQuantityAndUnit(clean);

  // 4. Extract Budget
  const budgetInr = parseIndianBudget(clean);

  // 5. Generate clean, punchy Title
  let title = clean
    .replace(/\b(?:urgent\s*requirement|need|wanted|required|looking\s*for|tender\s*for|requirement)\s*[:=-]?\s*/gi, "")
    .replace(/(?:budget|estimate|cost|price|ceiling|inr|rs\.?|₹)\s*[:=-]?\s*₹?\s*[0-9]+(?:\.[0-9]+)?\s*(?:cr|crore|crores|l|lac|lakh|lakhs|lacs|k)?/gi, "")
    .replace(/\b(?:at|in|near)\s+[1-9][0-9]{5}\b/gi, "")
    .replace(/\b[1-9][0-9]{5}\b/g, "")
    .trim();

  // If title was stripped too much or is empty, synthesize a professional title
  if (title.length < 5) {
    if (quantity && unit) {
      title = `${quantity} ${unit} ${category}`;
    } else {
      title = `Procurement for ${category}`;
    }
  } else {
    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);
    // Trim extraneous trailing commas or hyphens
    title = title.replace(/[-,\s]+$/, "");
  }

  return {
    title,
    category,
    quantity,
    unit,
    budgetInr,
    pincode,
    city,
    state,
    rawText: clean,
  };
}
