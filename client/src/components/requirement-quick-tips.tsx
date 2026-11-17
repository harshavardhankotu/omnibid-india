import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Category } from "@omnibid/api-client-react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  IndianRupee,
  Lightbulb,
  MapPin,
  ShieldCheck,
} from "lucide-react";

export type RequirementFormSection =
  | "overview"
  | "category"
  | "title"
  | "description"
  | "custom"
  | "location"
  | "budget"
  | "deadline"
  | "recurring"
  | "modes";

interface RequirementQuickTipsProps {
  activeSection: RequirementFormSection;
  selectedCategory?: Category;
  title: string;
  description: string;
  city: string;
  state: string;
  maxBudget: number;
  deadlineHours: number;
  isRecurring: boolean;
  recurringInterval?: string;
  isMegaProject: boolean;
  isSyndicate: boolean;
  jugaadMode: boolean;
  customData?: Record<string, string>;
}

const SECTION_GUIDANCE: Record<
  RequirementFormSection,
  {
    heading: string;
    summary: string;
    bullets: string[];
    avoid: string;
  }
> = {
  overview: {
    heading: "Procurement Posting Guide",
    summary: "Clear specifications attract faster, more competitive reverse-auction bids.",
    bullets: [
      "Pick the closest category so verified sector specialists are notified automatically.",
      "Specify measurable quantities, standards, and delivery timelines upfront.",
      "Set a realistic ceiling budget—providers bid downward from your max budget.",
    ],
    avoid: "Submitting vague 1-line scopes that force vendors to quote high risk buffers.",
  },
  category: {
    heading: "Choosing the Right Category",
    summary: "Categories unlock sector-specific BOQ fields and match verified suppliers.",
    bullets: [
      "Selecting a category automatically loads technical fields contractors expect.",
      "Even when enabling Jugaad Mode, a category must still be selected before posting.",
      "Check if the category enforces a minimum price floor before setting a low budget.",
    ],
    avoid: "Leaving Category unselected—this is the most common submission blocker.",
  },
  title: {
    heading: "Writing a High-Response Title",
    summary: "Include the deliverable, scale/quantity, and city or project name (min 5 chars).",
    bullets: [
      "Lead with what is needed: e.g. 'Supply of 500 MT Fe 550D TMT Rebars'.",
      "Mention key grade, capacity, or service type right in the headline.",
      "Keep it scannable—under 80 characters works best on vendor alerts.",
    ],
    avoid: "Generic titles like 'Need contractor' or 'Urgent work required'.",
  },
  description: {
    heading: "Detailing Your Scope",
    summary: "Minimum 20 characters required. Aim for 3–5 concrete sentences.",
    bullets: [
      "State exact units, dimensions, IS/ISO specs, or SLAs expected.",
      "Specify site access constraints, unloading rules, or working hours.",
      "Mention required test certificates, warranties, or GST invoicing terms.",
    ],
    avoid: "Omitting deliverables or inspection criteria, which triggers clarification delays.",
  },
  custom: {
    heading: "Category Technical Fields",
    summary: "Structured specs let bidders price accurately without guesswork.",
    bullets: [
      "Fill in all starred (*) category fields to avoid follow-up back-and-forth.",
      "Provide exact units or target dates where requested.",
    ],
    avoid: "Skipping required technical specs on regulated or bulk orders.",
  },
  location: {
    heading: "City & State Matching",
    summary: "Regional providers bid sharper when transport and mobilization distance is clear.",
    bullets: [
      "Enter the exact delivery or execution City and State (min 2 chars each).",
      "Cross-state supplies automatically affect IGST vs CGST/SGST billing.",
    ],
    avoid: "Abbreviating city names inconsistently (e.g. 'BLR' instead of 'Bengaluru').",
  },
  budget: {
    heading: "Setting Your Max Budget",
    summary: "Reverse auctions drive quotes down from your ceiling (minimum ₹100).",
    bullets: [
      "Budgets above ₹10,000 highlight your listing as High Value to verified vendors.",
      "Contracts above ₹30,000 are subject to statutory Section 194C TDS (1%–2%).",
      "Remember OmniBid charges a standard 2% escrow fee on final settlement.",
    ],
    avoid: "Setting a ceiling below the category minimum price floor.",
  },
  deadline: {
    heading: "Picking Auction Duration",
    summary: "Balance urgency with supplier quoting time (1–72 hours).",
    bullets: [
      "2–6 hours: Ideal for spot logistics, urgent repairs, or backhaul slots.",
      "24–48 hours: Best for standard B2B procurement and competitive price drops.",
      "72 hours: Recommended for multi-item BOQs and high-value works.",
    ],
    avoid: "Using a 2-hour window for complex custom fabrication or large tenders.",
  },
  recurring: {
    heading: "Recurring Schedules",
    summary: "Automate repeat tenders with one-click reposting once an auction closes.",
    bullets: [
      "Select a cadence (weekly, biweekly, monthly, or quarterly) when enabled.",
      "Great for housekeeping, security, fleet runs, and scheduled consumables.",
    ],
    avoid: "Enabling Recurring Requirement without selecting a frequency interval.",
  },
  modes: {
    heading: "Special Procurement Modes",
    summary: "Combine modes to match project structure and buyer group size.",
    bullets: [
      "Mega Project lets you split large works into sub-tasks after posting.",
      "Society Syndicate pools neighbor demand for bulk-discount bidding.",
      "Jugaad Mode broadcasts open-ended problems across categories.",
    ],
    avoid: "Enabling Mega Project for a single straightforward service call.",
  },
};

function getCategoryHint(category?: Category): string | null {
  if (!category) return null;
  const slug = category.slug.toLowerCase();
  if (slug.includes("construct") || slug.includes("civil") || slug.includes("steel")) {
    return "Include material grade (e.g. Fe 550D / M40), quantity unit, mill test certificates, and site unloading terms.";
  }
  if (slug.includes("logis") || slug.includes("transport") || slug.includes("freight")) {
    return "Mention origin-destination pin codes, payload weight, vehicle type (e.g. 32ft MXL), and loading hours.";
  }
  if (slug.includes("tech") || slug.includes("it") || slug.includes("software")) {
    return "Specify tech stack, hosting/compliance needs, API integrations, and milestone acceptance criteria.";
  }
  if (slug.includes("event") || slug.includes("hospitality")) {
    return "Include guest headcount, venue city, event dates, and setup/teardown timings.";
  }
  if (slug.includes("health") || slug.includes("med")) {
    return "Note accreditation requirements (NABH/NABL), patient or batch specifics, and turnaround window.";
  }
  if (slug.includes("security")) {
    return "State guard shift count (8h/12h), PSARA licensing needs, and site perimeter details.";
  }
  return `Provide clear quantity, quality benchmarks, and completion timeline tailored to ${category.name}.`;
}

export function RequirementQuickTips({
  activeSection,
  selectedCategory,
  title,
  description,
  city,
  state,
  maxBudget,
  deadlineHours,
  isRecurring,
  recurringInterval,
  isMegaProject,
  isSyndicate,
  jugaadMode,
  customData,
}: RequirementQuickTipsProps) {
  const guidance = SECTION_GUIDANCE[activeSection] ?? SECTION_GUIDANCE.overview;
  const categoryHint = getCategoryHint(selectedCategory);

  const rawFloor =
    selectedCategory && "minBidFloor" in selectedCategory
      ? (selectedCategory as Category & { minBidFloor?: number | null }).minBidFloor
      : null;
  const budgetBelowFloor = typeof rawFloor === "number" && rawFloor > 0 && maxBudget < rawFloor;

  const customFields =
    (selectedCategory?.customFields as Array<{
      key: string;
      label: string;
      required?: boolean;
    }> | undefined) ?? [];
  const missingRequiredCustom = customFields.filter(
    (cf) => cf.required && !String(customData?.[cf.key] ?? "").trim()
  );

  const checks = [
    {
      id: "category",
      label: "Category selected",
      ok: Boolean(selectedCategory),
      detail: selectedCategory ? selectedCategory.name : "Required before submitting",
    },
    {
      id: "title",
      label: "Clear title (5+ chars)",
      ok: title.trim().length >= 5,
      detail: `${title.trim().length}/5 min`,
    },
    {
      id: "description",
      label: "Detailed scope (20+ chars)",
      ok: description.trim().length >= 20,
      detail: `${description.trim().length}/20 min`,
    },
    {
      id: "location",
      label: "City & State specified",
      ok: city.trim().length >= 2 && state.trim().length >= 2,
      detail: city.trim() && state.trim() ? `${city.trim()}, ${state.trim()}` : "Both required",
    },
    {
      id: "budget",
      label: "Valid max budget",
      ok: maxBudget >= 100 && !budgetBelowFloor,
      detail: budgetBelowFloor
        ? `Below ₹${rawFloor?.toLocaleString("en-IN")} floor`
        : `₹${maxBudget.toLocaleString("en-IN")}`,
    },
  ];

  if (isRecurring) {
    checks.push({
      id: "recurring",
      label: "Recurring interval chosen",
      ok: Boolean(recurringInterval && recurringInterval.length > 0),
      detail: recurringInterval ? recurringInterval : "Pick a frequency",
    });
  }

  const completedCount = checks.filter((c) => c.ok).length;
  const warnings: string[] = [];

  if (budgetBelowFloor && rawFloor) {
    warnings.push(
      `Your max budget (₹${maxBudget.toLocaleString("en-IN")}) is below ${selectedCategory?.name}'s minimum floor of ₹${rawFloor.toLocaleString("en-IN")}.`
    );
  }
  if (missingRequiredCustom.length > 0) {
    warnings.push(
      `Fill in required category fields: ${missingRequiredCustom.map((f) => f.label).join(", ")}.`
    );
  }
  if (jugaadMode && !selectedCategory) {
    warnings.push("Even with Jugaad Mode on, select the closest Category so validation passes.");
  }
  if (isRecurring && !recurringInterval) {
    warnings.push("Choose how often this recurring requirement should repeat.");
  }
  if (isMegaProject && maxBudget < 10000) {
    warnings.push("Mega Projects work best with budgets ≥ ₹10,000 when splitting into multiple sub-tasks.");
  }

  return (
    <aside className="space-y-4 lg:sticky lg:top-20" aria-label="Quick Tips sidebar" data-testid="sidebar-quick-tips">
      {/* Context-Aware Guidance Card */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
              Quick Tips
            </CardTitle>
            <span className="text-[11px] font-medium text-muted-foreground capitalize" data-testid="text-active-tip-section">
              {activeSection === "overview" ? "General" : activeSection}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground mt-1" data-testid="text-tip-heading">
            {guidance.heading}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{guidance.summary}</p>
        </CardHeader>

        <CardContent className="space-y-3 pt-0 text-xs">
          <ul className="space-y-2 text-foreground/90">
            {guidance.bullets.map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          <div className="border-t border-border pt-2.5 text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Common mistake to avoid: </span>
            {guidance.avoid}
          </div>

          {categoryHint && (
            <div
              className="rounded-lg bg-muted/60 border border-border/80 p-2.5 text-xs text-foreground/90 leading-relaxed"
              data-testid="box-category-tip"
            >
              <span className="font-semibold text-primary">{selectedCategory?.name} tip: </span>
              {categoryHint}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Warnings (if any error-prone state detected) */}
      {warnings.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-tip-warnings">
          <CardContent className="p-4 space-y-2">
            <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Watch out before posting
            </div>
            <ul className="space-y-1.5 text-xs text-amber-900/90 dark:text-amber-200">
              {warnings.map((w, idx) => (
                <li key={idx} className="leading-relaxed">
                  {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Submission Readiness Checklist */}
      <Card className="border-border" data-testid="card-readiness-checklist">
        <CardHeader className="pb-2.5">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Submission Readiness
            </CardTitle>
            <span className="text-xs font-semibold tabular-nums text-foreground" data-testid="text-readiness-score">
              {completedCount}/{checks.length} ready
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {checks.map((check) => (
            <div
              key={check.id}
              className="flex items-center justify-between gap-2 text-xs py-1 border-b border-border/50 last:border-b-0"
              data-testid={`check-item-${check.id}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                {check.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                )}
                <span className={check.ok ? "text-foreground font-medium truncate" : "text-muted-foreground truncate"}>
                  {check.label}
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{check.detail}</span>
            </div>
          ))}

          <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
            <span className="inline-flex items-center gap-1">
              <IndianRupee className="h-3 w-3" />
              {maxBudget > 30000 ? "Sec. 194C TDS applies" : "0% TDS (≤ ₹30k)"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {deadlineHours}h auction
            </span>
            {isSyndicate && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Group buy active
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
