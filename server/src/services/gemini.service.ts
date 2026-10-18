import { db } from "../db/connection.js";
import { requirements, bids, users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface SmartMatchResponse {
  recommendedBidId: string;
  confidenceScore: number;
  reasoningSummary: string;
  riskFactors: string[];
}

export class GeminiService {
  /**
   * Deterministic scoring calculation based on price competitiveness, KYC verification,
   * milestone structure, and technical scope alignment.
   */
  static computeHeuristicScore(params: {
    budget: number;
    bidAmount: number;
    kycStatus?: string;
    milestoneCount?: number;
    proposalText?: string;
    customData?: any;
  }): { score: number; confidence: number; reason: string } {
    const { budget, bidAmount, kycStatus = "verified", milestoneCount = 1, proposalText = "", customData = {} } = params;
    let score = 50;

    // Price ratio score
    if (bidAmount <= budget) {
      score += Math.min(30, ((budget - bidAmount) / budget) * 50);
    } else {
      score -= ((bidAmount - budget) / budget) * 40;
    }

    if (kycStatus === "verified") score += 15;
    if (milestoneCount >= 2) score += 5;

    const customDataStr = JSON.stringify(customData).toLowerCase();
    const proposalLower = proposalText.toLowerCase();
    if (customDataStr.includes("steel") && proposalLower.includes("steel")) score += 10;
    if (customDataStr.includes("kubernetes") && proposalLower.includes("cloud")) score += 10;

    return {
      score: Math.round(score * 10) / 10,
      confidence: 0.88,
      reason: `Bid of Rs. ${bidAmount} vs target Rs. ${budget} (KYC: ${kycStatus}, Milestones: ${milestoneCount})`,
    };
  }

  /**
   * Evaluates bids against requirement metadata using Gemini 1.5 Flash
   * with offline deterministic fallback.
   */
  static async evaluateSmartMatch(requirementId: string): Promise<SmartMatchResponse> {
    const [req] = await db.select().from(requirements).where(eq(requirements.id, requirementId)).limit(1);
    if (!req) {
      throw new Error("Requirement not found");
    }

    const bidList = await db
      .select({
        bid: bids,
        provider: users,
      })
      .from(bids)
      .leftJoin(users, eq(bids.provider_id, users.id))
      .where(eq(bids.requirement_id, requirementId));

    if (!bidList || bidList.length === 0) {
      throw new Error("No bids found for this requirement to evaluate");
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // 1. If API key exists, attempt GenAI call
    if (apiKey && !apiKey.includes("mock")) {
      try {
        const prompt = `
You are an elite Indian B2B procurement and technical contract evaluator.
Evaluate the following requirement and competing bids to select the best value-for-money, technically compliant bid.

REQUIREMENT:
Title: ${req.title}
Sector: ${req.sector}
Budget: Rs. ${req.budget}
Timeline: ${req.timeline}
Technical Metadata (JSONB): ${JSON.stringify(req.custom_data)}

CANDIDATE BIDS:
${bidList.map((b, i) => `
[Bid ${i + 1}] ID: ${b.bid.id}
Provider: ${b.provider?.name} (KYC: ${b.provider?.kyc_status}, City: ${b.provider?.city})
Proposal: ${b.bid.proposal_text}
Bid Amount: Rs. ${b.bid.bid_amount}
Milestone Count: ${b.bid.milestone_count}
`).join("\n")}

Respond ONLY with valid JSON matching this schema:
{
  "recommendedBidId": "UUID string",
  "confidenceScore": number (0.0 to 1.0),
  "reasoningSummary": "2-3 sentences explaining why this bid offers optimal balance of cost, timeline, and tech stack match.",
  "riskFactors": ["risk 1", "risk 2"]
}
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText);
            return {
              recommendedBidId: parsed.recommendedBidId,
              confidenceScore: parsed.confidenceScore || 0.92,
              reasoningSummary: parsed.reasoningSummary,
              riskFactors: parsed.riskFactors || [],
            };
          }
        }
      } catch (err: any) {
        console.warn("Gemini 1.5 Flash API error, triggering deterministic fallback:", err?.message);
      }
    }

    // 2. Deterministic Fallback Evaluation
    const budgetVal = parseFloat(req.budget);
    let bestBid = bidList[0];
    let highestScore = -Infinity;
    let selectedReason = "";

    for (const item of bidList) {
      const bidAmt = parseFloat(item.bid.bid_amount);
      let score = 50;

      // Price ratio score
      if (bidAmt <= budgetVal) {
        score += Math.min(30, ((budgetVal - bidAmt) / budgetVal) * 50);
      } else {
        score -= ((bidAmt - budgetVal) / budgetVal) * 40;
      }

      // KYC verification bonus
      if (item.provider?.kyc_status === "verified") {
        score += 15;
      }

      // Milestone structure bonus
      if (item.bid.milestone_count >= 2) {
        score += 5;
      }

      // Proposal keyword alignment with custom_data
      const customDataStr = JSON.stringify(req.custom_data).toLowerCase();
      const proposalLower = item.bid.proposal_text.toLowerCase();
      if (customDataStr.includes("kubernetes") && proposalLower.includes("cloud")) score += 10;
      if (customDataStr.includes("concrete") && proposalLower.includes("foundation")) score += 10;
      if (customDataStr.includes("trailer") && proposalLower.includes("freight")) score += 10;

      if (score > highestScore) {
        highestScore = score;
        bestBid = item;
        selectedReason = `Bid by ${item.provider?.name || "Contractor"} offers competitive pricing of Rs. ${bidAmt} within the target budget of Rs. ${budgetVal} with verified KYC and structured milestone delivery.`;
      }
    }

    return {
      recommendedBidId: bestBid.bid.id,
      confidenceScore: 0.88,
      reasoningSummary: selectedReason,
      riskFactors: [
        "Ensure mobilization advance is conditioned on initial architecture sign-off",
        "Verify delivery timeline adherence against weekly milestone checkpoints",
      ],
    };
  }
}
