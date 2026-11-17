import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

type FaqAudience = "all" | "buyers" | "contractors" | "escrow";

interface FaqItem {
  id: string;
  audience: Exclude<FaqAudience, "all">;
  audienceLabel: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: "reverse-auction-basics",
    audience: "buyers",
    audienceLabel: "Buyers & Contractors",
    question: "How does a B2B reverse auction work compared to traditional quoting?",
    answer:
      "In a traditional procurement cycle, buyers chase individual vendor quotes over days. On OmniBid, the buyer publishes a single requirement with a maximum budget ceiling and auction deadline. Verified contractors compete in real time by submitting progressively lower prices, driving transparent market price discovery.",
  },
  {
    id: "l1-selection",
    audience: "buyers",
    audienceLabel: "For Buyers",
    question: "What does L1 mean, and do buyers have to award the lowest price?",
    answer:
      "L1 refers to the lowest active financial bid in the auction. While L1 gives buyers the most competitive rate benchmark, you are never forced to choose price alone—you can compare DigiLocker & GST verification status, provider trust scores, past buyer ratings, and delivery timelines, or use AI Smart Match before locking an award.",
  },
  {
    id: "two-envelope-rfp",
    audience: "buyers",
    audienceLabel: "Enterprise Procurement",
    question: "How does Two-Envelope RFP bidding protect technical quality?",
    answer:
      "High-value enterprise requirements automatically enable Two-Envelope bidding. Contractors first upload their technical portfolio and compliance documents (Envelope A) while their financial bid stays hidden. Only after the buyer reviews and approves a bidder's technical qualifications is the price revealed.",
  },
  {
    id: "anti-sniping-extension",
    audience: "contractors",
    audienceLabel: "For Contractors",
    question: "What happens if a competing contractor places a lower bid in the final seconds?",
    answer:
      "OmniBid includes automatic anti-sniping protection. Whenever a new L1 lowest bid is submitted within the final 120 seconds of the countdown timer, the auction deadline automatically extends by 120 seconds so all participating contractors have a fair opportunity to respond.",
  },
  {
    id: "lower-bid-alerts",
    audience: "contractors",
    audienceLabel: "For Contractors",
    question: "How do I get notified if someone undercuts my current bid?",
    answer:
      "Click Subscribe on any live requirement page to enable lower-bid alerts. You will receive real-time Web Push and in-app notifications whenever a competing contractor submits a bid lower than your current best bid, or you can watch live bid drops inside the Auction War Room.",
  },
  {
    id: "escrow-and-tds",
    audience: "escrow",
    audienceLabel: "Escrow & Tax",
    question: "How are escrow fees, GSTIN verification, and Section 194C TDS handled?",
    answer:
      "Once a bid is accepted, the buyer funds milestone-backed escrow rather than paying upfront blindly. Both parties see an itemized settlement breakdown before locking L1—including the standard 2% platform escrow retainer and automatic Income Tax Act Section 194C TDS calculation (1% for individuals/HUFs or 2% for companies above the ₹30,000 threshold).",
  },
  {
    id: "dispute-protection",
    audience: "escrow",
    audienceLabel: "Escrow & Tax",
    question: "What happens if work quality or delivery timelines are disputed?",
    answer:
      "Escrow funds remain protected until milestone work proofs are verified. If an issue arises on an active contract, the buyer can raise a formal dispute directly from the requirement page, giving the provider a structured 7-day response window while funds stay safely held in escrow.",
  },
];

const AUDIENCE_TABS: { value: FaqAudience; label: string }[] = [
  { value: "all", label: "All Topics" },
  { value: "buyers", label: "For Buyers" },
  { value: "contractors", label: "For Contractors" },
  { value: "escrow", label: "Escrow & Tax" },
];

export function ReverseAuctionFaq() {
  const [selectedAudience, setSelectedAudience] = useState<FaqAudience>("all");
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const visibleFaqs =
    selectedAudience === "all"
      ? FAQ_ITEMS
      : FAQ_ITEMS.filter((item) => item.audience === selectedAudience);

  return (
    <section
      className="mt-10 rounded-2xl border border-border bg-card p-6 md:p-8"
      aria-labelledby="faq-section-heading"
      data-testid="section-reverse-auction-faq"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Procurement Guide
            </p>
            <h2
              id="faq-section-heading"
              className="text-xl md:text-2xl font-bold tracking-tight text-foreground"
            >
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Everything new buyers and contractors need to know about live reverse auctions, L1 award selection, and escrow settlements.
            </p>
          </div>

          <div
            className="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-muted/70 border border-border"
            role="tablist"
            aria-label="Filter FAQ topics"
          >
            {AUDIENCE_TABS.map((tab) => {
              const isActive = selectedAudience === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSelectedAudience(tab.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`faq-filter-${tab.value}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap shrink-0"
              onClick={() => setLocation("/requirements")}
              data-testid="faq-cta-browse"
            >
              Browse Live Auctions
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              className="whitespace-nowrap shrink-0"
              onClick={() => setLocation(user ? "/requirements/new" : "/register")}
              data-testid="faq-cta-post"
            >
              {user ? "Post a Requirement" : "Create Free Account"}
            </Button>
          </div>
        </div>

        <div className="lg:col-span-8">
          <Accordion
            type="single"
            collapsible
            defaultValue={visibleFaqs[0]?.id}
            key={selectedAudience}
            className="rounded-xl border border-border bg-background/60 dark:bg-background/40 px-4 sm:px-6 divide-y divide-border"
            data-testid="faq-accordion"
          >
            {visibleFaqs.map((item, idx) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="border-b-0"
                data-testid={`faq-item-${item.id}`}
              >
                <AccordionTrigger
                  className="py-4 min-h-[48px] text-left hover:no-underline group"
                  data-testid={`faq-trigger-${item.id}`}
                >
                  <div className="pr-4 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-normal">
                      <span className="tabular-nums font-medium text-primary">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.audienceLabel}</span>
                    </div>
                    <div className="text-sm sm:text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {item.question}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-5 pt-0.5">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
