import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useParams, useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useGetRequirement,
  getGetRequirementQueryKey,
  useCreateBid,
  getListBidsQueryKey,
  useGetMySubscription,
} from "@omnibid/api-client-react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, ExternalLink, FileText, IndianRupee, Loader2, Shield, Star, Truck, UserCheck, Users, Zap,
} from "lucide-react";
import { BidProfitCalculator } from "@/components/bid-profit-calculator";

const schema = z.object({
  bidAmount: z.number().min(1, "Enter a bid amount"),
  message: z.string().min(20, "Message must be at least 20 characters").max(500, "Max 500 characters"),
  proofOfWork: z.string().optional(),
  estimatedCompletion: z.string().min(2, "Enter your estimated start time"),
  executorType: z.enum(["self", "partial"]),
  subcontractorName: z.string().optional(),
  isHighlighted: z.boolean(),
  envelopeAUrl: z.string().url("Enter a valid URL").or(z.literal("")).optional(),
  isBackhaul: z.boolean(),
  crewSizeOffered: z.number().min(1).optional(),
});

type FormData = z.infer<typeof schema>;

const START_OPTIONS = [
  "Available RIGHT NOW",
  "Within 1 hour",
  "In 2 hours",
  "Today evening",
  "Tomorrow morning",
  "Within 24 hours",
  "Within 2 days",
];

export default function NewBid() {
  const { requirementId } = useParams<{ requirementId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: req } = useGetRequirement(requirementId, {
    query: { queryKey: getGetRequirementQueryKey(requirementId), enabled: !!requirementId },
  });

  const { data: sub } = useGetMySubscription();
  const createBidMutation = useCreateBid();

  const isTwoEnvelope = req?.bidType === "two_envelope";
  const isAgencyProvider = user?.role === "agency_provider";

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      bidAmount: req ? Math.floor(Number(req.maxBudget) * 0.8) : 1000,
      message: "",
      proofOfWork: "",
      estimatedCompletion: "Within 24 hours",
      executorType: "self",
      subcontractorName: "",
      isHighlighted: false,
      envelopeAUrl: "",
      isBackhaul: false,
      crewSizeOffered: isAgencyProvider ? 1 : undefined,
    },
  });

  const isHighlighted = form.watch("isHighlighted");
  const executorType = form.watch("executorType");
  const bidAmount = form.watch("bidAmount");
  const isBackhaul = form.watch("isBackhaul");

  const priceFloor = req?.category && "priceFloor" in req.category ? (req.category as { priceFloor?: number | null }).priceFloor : null;
  const belowFloor = priceFloor && bidAmount > 0 && bidAmount < priceFloor;

  const onSubmit = (data: FormData) => {
    createBidMutation.mutate(
      {
        requirementId,
        data: {
          bidAmount: data.bidAmount,
          message: data.message,
          proofOfWork: data.proofOfWork || undefined,
          estimatedCompletion: data.estimatedCompletion,
          executorType: data.executorType,
          subcontractorName: data.subcontractorName || undefined,
          isHighlighted: data.isHighlighted,
          envelopeAUrl: data.envelopeAUrl || undefined,
          crewSizeOffered: data.crewSizeOffered || undefined,
          isBackhaul: data.isBackhaul,
        } as Parameters<typeof createBidMutation.mutate>[0]["data"],
      },
      {
        onSuccess: () => {
          toast({ title: "Bid placed!", description: isTwoEnvelope ? "Your technical bid is pending buyer review." : "The buyer has been notified." });
          qc.invalidateQueries({ queryKey: getListBidsQueryKey(requirementId) });
          qc.invalidateQueries({ queryKey: getGetRequirementQueryKey(requirementId) });
          setLocation(`/requirements/${requirementId}`);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to place bid";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-bold">Place Your Bid</h1>
          {req && (
            <p className="text-sm text-muted-foreground mt-0.5">
              For: <span className="font-medium text-foreground">{req.title}</span>
            </p>
          )}
          {req && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Buyer's max budget: <span className="font-semibold text-primary">₹{req.maxBudget.toLocaleString("en-IN")}</span>
              {" • "}{req.bidCount} bids so far
              {priceFloor && (
                <span className="ml-1 text-orange-600">• Min floor: ₹{priceFloor.toLocaleString("en-IN")}</span>
              )}
            </p>
          )}
          {isTwoEnvelope && (
            <div className="mt-2 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 text-xs text-violet-700 dark:text-violet-400">
              <FileText className="h-3.5 w-3.5 inline mr-1.5" />
              <strong>Two-Envelope RFP:</strong> Submit your technical portfolio (Envelope A) first. Your price is hidden until the buyer approves your technical bid.
            </div>
          )}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* Two-Envelope: Technical bid (Envelope A) */}
            {isTwoEnvelope && (
              <Card className="border-violet-200 dark:border-violet-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-violet-700 dark:text-violet-400">
                    <FileText className="h-4 w-4" />
                    Envelope A — Technical Portfolio
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Share your portfolio, compliance credentials, and past work. The buyer reviews this before seeing your price.
                  </p>
                </CardHeader>
                <CardContent>
                  <FormField control={form.control} name="envelopeAUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Portfolio / Technical Document URL</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            className="pl-8"
                            placeholder="https://drive.google.com/your-portfolio or website"
                            data-testid="input-envelope-a-url"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        Share a Google Drive link, website, or portfolio URL.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Your Offer</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="bidAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {isTwoEnvelope ? "Bid Amount (₹) — hidden until technical approved" : "Bid Amount (₹)"}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          className="pl-8"
                          placeholder="5000"
                          data-testid="input-bid-amount"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </div>
                    </FormControl>
                    {req && field.value > 0 && (
                      <FormDescription>
                        {((field.value / req.maxBudget) * 100).toFixed(0)}% of buyer's max budget
                      </FormDescription>
                    )}
                    {belowFloor && (
                      <Alert variant="destructive" className="py-2 mt-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <AlertDescription className="text-xs">
                          Bid is below the ₹{priceFloor?.toLocaleString("en-IN")} minimum floor for {req?.categoryName}. The server will reject this bid.
                        </AlertDescription>
                      </Alert>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="estimatedCompletion" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" />When can you start?</FormLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {START_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => field.onChange(opt)}
                          className={`py-2 px-3 rounded-lg border text-xs font-medium text-left transition-all ${field.value === opt ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"}`}
                          data-testid={`button-start-${opt.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Backhaul / Empty Slot */}
                <FormField control={form.control} name="isBackhaul" render={({ field }) => (
                  <FormItem className="flex items-center justify-between p-3 rounded-xl border border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/20">
                    <div>
                      <FormLabel className="flex items-center gap-1.5 text-teal-700 dark:text-teal-400 cursor-pointer">
                        <Truck className="h-4 w-4" />
                        Cancellation / Empty Slot
                      </FormLabel>
                      <FormDescription className="text-[10px] mt-0.5 text-teal-600 dark:text-teal-500">
                        Got a freed-up slot or return trip? Mark this for a discount badge.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-backhaul"
                      />
                    </FormControl>
                  </FormItem>
                )} />
                {isBackhaul && (
                  <Badge className="bg-teal-500 text-white text-xs">Cancellation Rate — Save up to 40%</Badge>
                )}

                {/* Crew size for agency providers */}
                {isAgencyProvider && (
                  <FormField control={form.control} name="crewSizeOffered" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Crew Size Offered
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="e.g. 5"
                          data-testid="input-crew-size"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(Number(e.target.value) || undefined)}
                        />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        How many workers will you deploy for this job?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </CardContent>
            </Card>

            <BidProfitCalculator
              bidAmount={Number(bidAmount) || 0}
              maxBudget={req?.maxBudget ?? null}
              isHighlighted={isHighlighted}
              defaultEntityKind={isAgencyProvider ? "company" : "individual"}
            />

            {/* Executor Declaration — Anti-Ghost Contractor */}
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  Who will do the work?
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  OmniBid requires transparency. Ghost contracting is a terms violation.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <FormField control={form.control} name="executorType" render={({ field }) => (
                  <FormItem>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => field.onChange("self")}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${field.value === "self" ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400" : "border-border hover:border-blue-300"}`}
                        data-testid="button-executor-self"
                      >
                        <UserCheck className="h-4 w-4 flex-shrink-0" />
                        <div className="text-left">
                          <div className="font-semibold text-xs">I'll do it myself</div>
                          <div className="text-[10px] text-muted-foreground">100% in-house</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => field.onChange("partial")}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${field.value === "partial" ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400" : "border-border hover:border-blue-300"}`}
                        data-testid="button-executor-partial"
                      >
                        <Users className="h-4 w-4 flex-shrink-0" />
                        <div className="text-left">
                          <div className="font-semibold text-xs">Partial sub-work</div>
                          <div className="text-[10px] text-muted-foreground">One specialist involved</div>
                        </div>
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />

                {executorType === "partial" && (
                  <FormField control={form.control} name="subcontractorName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Name the specialist (required for partial)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Ravi Electricals for wiring work" data-testid="input-subcontractor" {...field} />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        Max 1 layer of sub-work. No sub-sub chains allowed.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Your Pitch</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="message" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Why should they choose you?</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your experience, approach, and why you're the best fit for this requirement..."
                        rows={4}
                        data-testid="input-message"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{field.value.length}/500 characters</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="proofOfWork" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proof of Experience (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. I've handled 12 similar cases in the last 6 months"
                        data-testid="input-proof"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <FormField control={form.control} name="isHighlighted" render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel className="flex items-center gap-1.5">
                        <Star className="h-4 w-4 text-amber-500" />
                        Feature My Bid — ₹50
                      </FormLabel>
                      <FormDescription className="text-xs mt-0.5">
                        Pin your bid to the top with an amber border. Stand out from the competition.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-highlighted" />
                    </FormControl>
                  </FormItem>
                )} />
                {isHighlighted && (
                  <Badge className="mt-2 bg-amber-500 text-white text-xs">Featured bid — ₹50 charge (simulated)</Badge>
                )}
              </CardContent>
            </Card>

            {sub && sub.plan === "free" && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                Free plan: <span className="font-semibold">{sub.bidsRemaining} bids remaining</span> this month.{" "}
                <button type="button" onClick={() => setLocation("/subscriptions")} className="text-primary hover:underline font-medium" data-testid="link-upgrade">
                  Upgrade for more
                </button>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full font-semibold" disabled={createBidMutation.isPending} data-testid="button-submit">
              {createBidMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isTwoEnvelope ? "Submit Technical Bid" : `Place Bid ${bidAmount > 0 ? `— ₹${Number(bidAmount).toLocaleString("en-IN")}` : ""}`}
            </Button>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
