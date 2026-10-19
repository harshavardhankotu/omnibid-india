/**
 * Telegram Bot Auto-Broadcaster for OmniBid India
 * Sends non-blocking multi-lingual deal alerts (English, Hindi, Telugu)
 * with contextual affiliate partner tracking and live auction war room links.
 */

export interface BroadcastLogEntry {
  id: string;
  requirementId: string;
  requirementTitle: string;
  category?: string;
  city?: string;
  state?: string;
  pincode?: string;
  l1Amount: number | null;
  matchedOfferId: string | null;
  matchedOfferTitle: string | null;
  matchedPartnerName: string | null;
  channelId: string;
  status: "delivered" | "simulated" | "failed";
  warRoomUrl: string;
  affiliateUrl: string | null;
  messageText: string;
  sentAt: string;
  error?: string;
}

// In-memory ring buffer storing the latest broadcast events
const broadcastHistory: BroadcastLogEntry[] = [];
const MAX_HISTORY = 100;

/**
 * Format amounts into Indian Rupee style string (e.g. ₹1,50,000 or ₹1.5L)
 */
function formatInr(amount: number | string | null | undefined): string {
  if (amount == null) return "₹N/A";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "₹N/A";

  if (num >= 10000000) {
    return `₹${(num / 10000000).toFixed(2).replace(/\.00$/, "")} Cr`;
  }
  if (num >= 100000) {
    return `₹${(num / 100000).toFixed(2).replace(/\.00$/, "")} L`;
  }
  return `₹${num.toLocaleString("en-IN")}`;
}

/**
 * Formats rich Markdown deal alerts in English, Hindi, and Telugu
 */
export function buildDealAlertMessage(params: {
  requirement: any;
  l1Bid?: any;
  matchedOffer?: any;
  warRoomUrl: string;
  affiliateUrl?: string | null;
}): string {
  const { requirement, l1Bid, matchedOffer, warRoomUrl, affiliateUrl } = params;

  const title = requirement.title || "Bulk Procurement Requirement";
  const category = requirement.categoryName || requirement.category || "General Construction & Procurement";
  const location = [requirement.city, requirement.state].filter(Boolean).join(", ") || "Pan-India";
  const pin = requirement.pincode ? ` (${requirement.pincode})` : "";
  const l1AmountVal = l1Bid ? (l1Bid.bidAmount || l1Bid.amount) : requirement.maxBudget;
  const formattedPrice = formatInr(l1AmountVal);
  const targetBudget = formatInr(requirement.maxBudget);

  let msg = `🚨 *OMNIBID INDIA — LIVE DEAL ALERT*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📦 *Requirement*: *${title}*\n`;
  msg += `🏷️ *Category*: ${category}\n`;
  msg += `📍 *Location*: ${location}${pin}\n`;
  msg += `💰 *Current L1 Bid*: *${formattedPrice}* (Budget Ceiling: ${targetBudget})\n`;
  msg += `⚡ *Status*: Live Reverse Auction Active\n\n`;

  // Hindi translation
  msg += `🇮🇳 *लाइव नीलामी सूचना (हिंदी)*:\n`;
  msg += `"${title}" के लिए नई L1 बोली दर्ज की गई है। तुरंत वॉर रूम में प्रवेश करें और सबसे प्रतिस्पर्धी मूल्य पर ऑर्डर हासिल करें!\n\n`;

  // Telugu translation
  msg += `⚡ *ప్రత్యక్ష బిడ్డింగ్ హెచ్చరిక (తెలుగు)*:\n`;
  msg += `"${title}" కొరకు తాజా L1 బిడ్ నమోదైంది. వెంటనే లైవ్ వార్ రూమ్‌లో పాల్గొని తక్కువ ధరకు కాంట్రాక్ట్ దక్కించుకోండి!\n\n`;

  // Live War Room URL
  msg += `🎯 *Live War Room*: [ENTER AUCTION WAR ROOM](${warRoomUrl})\n`;

  // Contextual Affiliate Offer link
  if (matchedOffer) {
    const partner = matchedOffer.partner_name || matchedOffer.partnerName || "Verified OmniBid Partner";
    const offerTitle = matchedOffer.title || "Working Capital & Raw Material Financing";
    const badge = matchedOffer.badge_text || matchedOffer.badgeText || "Preferred Commercial Rate";
    const partnerLink = affiliateUrl || `https://omnibid-india.onrender.com/api/affiliate/r/${matchedOffer.id}?reqId=${requirement.id}&ch=telegram_auto`;

    msg += `\n🤝 *Partner Commercial Opportunity* (${partner}):\n`;
    msg += `• *${offerTitle}* (${badge})\n`;
    msg += `👉 [CLAIM PARTNER RATE & FINANCING](${partnerLink})\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_OmniBid India • Reverse Auction Engine & B2B Escrow_`;

  return msg;
}

/**
 * Non-blocking deal broadcast to Telegram channel
 */
export async function broadcastDeal(
  requirement: any,
  l1Bid?: any,
  matchedOffer?: any
): Promise<BroadcastLogEntry> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_CHANNEL_ID || "@omnibid_deals";
  const reqId = requirement.id || `req_${Date.now()}`;

  const warRoomUrl = `https://omnibid-india.onrender.com/auction/${reqId}`;
  const affiliateUrl = matchedOffer?.id
    ? `https://omnibid-india.onrender.com/api/affiliate/r/${matchedOffer.id}?reqId=${reqId}&ch=telegram_auto`
    : null;

  const l1AmountNum = l1Bid
    ? Number(l1Bid.bidAmount || l1Bid.amount) || null
    : Number(requirement.maxBudget) || null;

  const messageText = buildDealAlertMessage({
    requirement,
    l1Bid,
    matchedOffer,
    warRoomUrl,
    affiliateUrl,
  });

  const logEntry: BroadcastLogEntry = {
    id: `bc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    requirementId: reqId,
    requirementTitle: requirement.title || "Procurement Requirement",
    category: requirement.categoryName || requirement.category,
    city: requirement.city,
    state: requirement.state,
    pincode: requirement.pincode,
    l1Amount: l1AmountNum,
    matchedOfferId: matchedOffer?.id || null,
    matchedOfferTitle: matchedOffer?.title || null,
    matchedPartnerName: matchedOffer?.partner_name || matchedOffer?.partnerName || null,
    channelId,
    status: "simulated",
    warRoomUrl,
    affiliateUrl,
    messageText,
    sentAt: new Date().toISOString(),
  };

  if (!token || !channelId) {
    console.log(
      `[AutoBroadcaster] TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID not set. Simulated broadcast generated for requirement ${reqId}.`
    );
    recordBroadcast(logEntry);
    return logEntry;
  }

  try {
    const telegramApiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(telegramApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        text: messageText,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });

    const data: any = await response.json();
    if (!response.ok || !data.ok) {
      logEntry.status = "failed";
      logEntry.error = data.description || `HTTP ${response.status}`;
      console.warn(`[AutoBroadcaster] Telegram API error: ${logEntry.error}`);
    } else {
      logEntry.status = "delivered";
      console.log(`[AutoBroadcaster] Deal broadcast successfully delivered to ${channelId} for ${reqId}`);
    }
  } catch (err: any) {
    logEntry.status = "failed";
    logEntry.error = err.message || "Network error dispatching Telegram alert";
    console.warn(`[AutoBroadcaster] Non-blocking dispatch failed: ${logEntry.error}`);
  }

  recordBroadcast(logEntry);
  return logEntry;
}

function recordBroadcast(entry: BroadcastLogEntry) {
  broadcastHistory.unshift(entry);
  if (broadcastHistory.length > MAX_HISTORY) {
    broadcastHistory.pop();
  }
}

/**
 * Returns the last N broadcasts for Admin Revenue Cockpit
 */
export function getRecentBroadcasts(limit = 20): BroadcastLogEntry[] {
  return broadcastHistory.slice(0, limit);
}
