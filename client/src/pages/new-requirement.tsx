import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useListCategories, useCreateRequirement, getListRequirementsQueryKey } from "@omnibid/api-client-react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getCategoryIcon } from "@/lib/category-icons";
import { IndianRupee, Loader2, PlusCircle, Clock, RefreshCw, Users, MessageSquare, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Category } from "@omnibid/api-client-react";
import { RequirementQuickTips, type RequirementFormSection } from "@/components/requirement-quick-tips";
import { MarketPricePredictor } from "@/components/market-price-predictor";

const RECURRING_INTERVALS = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every quarter" },
];

const schema = z.object({
  categoryId: z.string().min(1, "Select a category"),
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  city: z.string().min(2, "Enter your city"),
  state: z.string().min(2, "Enter your state"),
  maxBudget: z.number().min(100, "Budget must be at least ₹100"),
  deadlineHours: z.number().min(1).max(72),
  customData: z.record(z.string()).optional(),
  isRecurring: z.boolean(),
  recurringInterval: z.string().optional(),
  isMegaProject: z.boolean(),
  isSyndicate: z.boolean(),
  jugaadMode: z.boolean(),
});

type FormData = z.infer<typeof schema>;

const DEADLINE_OPTIONS = [
  { value: 2, label: "2 hours" },
  { value: 6, label: "6 hours" },
  { value: 12, label: "12 hours" },
  { value: 24, label: "1 day" },
  { value: 48, label: "2 days" },
  { value: 72, label: "3 days" },
];

export default function NewRequirement() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: categories } = useListCategories();
  const createMutation = useCreateRequirement();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      categoryId: "",
      title: "",
      description: "",
      city: user?.city ?? "",
      state: user?.state ?? "",
      maxBudget: 5000,
      deadlineHours: 24,
      customData: {},
      isRecurring: false,
      recurringInterval: "",
      isMegaProject: false,
      isSyndicate: false,
      jugaadMode: false,
    },
  });

  const [activeSection, setActiveSection] = useState<RequirementFormSection>("overview");

  const selectedCategoryId = form.watch("categoryId");
  const title = form.watch("title");
  const description = form.watch("description");
  const city = form.watch("city");
  const state = form.watch("state");
  const maxBudget = form.watch("maxBudget");
  const deadlineHours = form.watch("deadlineHours");
  const customData = form.watch("customData");
  const isRecurring = form.watch("isRecurring");
  const recurringInterval = form.watch("recurringInterval");
  const isMegaProject = form.watch("isMegaProject");
  const isSyndicate = form.watch("isSyndicate");
  const jugaadMode = form.watch("jugaadMode");
  const categoryList = Array.isArray(categories) ? categories : [];
  const selectedCategory = categoryList.find((c: Category) => c.id === selectedCategoryId);

  const onSubmit = (data: FormData) => {
    createMutation.mutate(
      {
        data: {
          categoryId: data.categoryId,
          title: data.title,
          description: data.description,
          city: data.city,
          state: data.state,
          maxBudget: data.maxBudget,
          deadlineHours: data.deadlineHours,
          customData: data.customData,
          isRecurring: data.isRecurring,
          recurringInterval: data.recurringInterval || undefined,
          isMegaProject: data.isMegaProject,
          isSyndicate: data.isSyndicate,
          jugaadMode: data.jugaadMode,
        },
      },
      {
        onSuccess: (req) => {
          toast({ title: "Requirement posted!", description: "Providers will start bidding shortly." });
          qc.invalidateQueries({ queryKey: getListRequirementsQueryKey() });
          setLocation(`/requirements/${req.id}`);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to post requirement", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Post a Problem</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Describe what you need and set your maximum budget. Providers will compete to win your project.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {/* Category */}
                <Card onMouseDown={() => setActiveSection("category")} onFocusCapture={() => setActiveSection("category")}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {categoryList.map((cat: Category) => {
                          const Icon = getCategoryIcon(cat.iconName);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => field.onChange(cat.id)}
                              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${field.value === cat.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                              data-testid={`button-cat-${cat.slug}`}
                            >
                              <Icon className={`h-5 w-5 ${field.value === cat.id ? "text-primary" : "text-muted-foreground"}`} />
                              <span className="text-[11px] font-medium text-center leading-tight">{cat.name}</span>
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Problem Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Problem Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem onFocusCapture={() => setActiveSection("title")}>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Need ACL surgery package in Hyderabad" data-testid="input-title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem onFocusCapture={() => setActiveSection("description")}>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your requirement in detail. The more you share, the better bids you'll receive."
                        rows={4}
                        data-testid="input-description"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Dynamic Category Fields */}
                {selectedCategory?.customFields && (selectedCategory.customFields as Array<{key: string; label: string; type: string; options?: string[]; required?: boolean}>).map((cf) => (
                  <FormField
                    key={cf.key}
                    control={form.control}
                    name={`customData.${cf.key}` as "customData"}
                    render={({ field }) => (
                      <FormItem onFocusCapture={() => setActiveSection("custom")}>
                        <FormLabel>{cf.label}{cf.required && <span className="text-destructive ml-1">*</span>}</FormLabel>
                        <FormControl>
                          {cf.type === "select" && cf.options ? (
                            <Select onValueChange={field.onChange} value={String(field.value ?? "")}>
                              <SelectTrigger data-testid={`select-${cf.key}`}>
                                <SelectValue placeholder={`Select ${cf.label}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {cf.options.map((opt) => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input placeholder={cf.label} data-testid={`input-${cf.key}`} value={String(field.value ?? "")} onChange={field.onChange} />
                          )}
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ))}
              </CardContent>
            </Card>

            {/* Location & Budget */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Location & Budget</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3" onFocusCapture={() => setActiveSection("location")}>
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl><Input placeholder="Bangalore" data-testid="input-city" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="state" render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl><Input placeholder="Karnataka" data-testid="input-state" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="maxBudget" render={({ field }) => {
                  const sliderMax = Math.max(500000, Math.ceil((field.value || 500) / 100000) * 100000);
                  return (
                    <FormItem onMouseDown={() => setActiveSection("budget")} onFocusCapture={() => setActiveSection("budget")}>
                      <FormLabel className="flex flex-wrap items-center justify-between gap-2">
                        <span>Maximum Budget</span>
                        <div className="flex items-center gap-2">
                          <div className="relative flex items-center">
                            <IndianRupee className="h-3.5 w-3.5 text-primary absolute left-2 pointer-events-none" />
                            <Input
                              type="number"
                              min={100}
                              step={500}
                              value={field.value}
                              onChange={(e) => {
                                setActiveSection("budget");
                                const nextVal = Number(e.target.value);
                                field.onChange(Number.isFinite(nextVal) ? Math.max(0, nextVal) : 0);
                              }}
                              className="h-8 w-32 pl-6 pr-2 text-right font-bold text-primary tabular-nums"
                              aria-label="Maximum Budget in INR"
                              data-testid="input-max-budget"
                            />
                          </div>
                          {field.value > 10000 && <Badge className="text-[10px] bg-amber-500 text-white">High Value</Badge>}
                        </div>
                      </FormLabel>
                      <FormControl>
                        <Slider
                          min={500}
                          max={sliderMax}
                          step={500}
                          value={[Math.min(sliderMax, Math.max(500, field.value || 500))]}
                          onValueChange={(v) => {
                            setActiveSection("budget");
                            field.onChange(v[0]);
                          }}
                          className="mt-2"
                          data-testid="slider-budget"
                        />
                      </FormControl>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1 tabular-nums">
                        <span>₹500</span>
                        <span>₹{sliderMax.toLocaleString("en-IN")}</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }} />

                <FormField control={form.control} name="deadlineHours" render={({ field }) => (
                  <FormItem onMouseDown={() => setActiveSection("deadline")} onFocusCapture={() => setActiveSection("deadline")}>
                    <FormLabel className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Auction Duration
                    </FormLabel>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-1">
                      {DEADLINE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setActiveSection("deadline");
                            field.onChange(opt.value);
                          }}
                          className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${field.value === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"}`}
                          data-testid={`button-deadline-${opt.value}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Market Price Predictor */}
            <MarketPricePredictor
              categoryId={selectedCategoryId}
              city={city}
              state={state}
              deadlineHours={deadlineHours}
              maxBudget={maxBudget}
              isSyndicate={isSyndicate}
              isMegaProject={isMegaProject}
              onApplyBudget={(amount) => {
                setActiveSection("budget");
                form.setValue("maxBudget", amount, { shouldValidate: true, shouldDirty: true });
              }}
              onInteract={() => setActiveSection("budget")}
            />

            {/* Recurring */}
            <Card onMouseDown={() => setActiveSection("recurring")} onFocusCapture={() => setActiveSection("recurring")}>
              <CardContent className="p-4 space-y-3">
                <FormField control={form.control} name="isRecurring" render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel className="flex items-center gap-1.5">
                        <RefreshCw className="h-4 w-4 text-blue-600" />
                        Recurring Requirement
                      </FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        One-click repost when this auction closes. E.g. weekly office cleaning.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-recurring" />
                    </FormControl>
                  </FormItem>
                )} />

                {isRecurring && (
                  <FormField control={form.control} name="recurringInterval" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">How often?</FormLabel>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {RECURRING_INTERVALS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => field.onChange(opt.value)}
                            className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${field.value === opt.value ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300" : "border-border hover:border-blue-300"}`}
                            data-testid={`button-interval-${opt.value}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </FormItem>
                  )} />
                )}
              </CardContent>
            </Card>

            {/* Advanced Toggles — Mega Project, Syndicate, Jugaad */}
            <Card onMouseDown={() => setActiveSection("modes")} onFocusCapture={() => setActiveSection("modes")}>
              <CardContent className="p-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Special Modes</p>

                <FormField control={form.control} name="isMegaProject" render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel className="flex items-center gap-1.5 cursor-pointer">
                        <Zap className="h-4 w-4 text-purple-600" />
                        Mega Project
                      </FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Split into sub-tasks. Providers bid on individual tasks.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-mega-project" />
                    </FormControl>
                  </FormItem>
                )} />
                {isMegaProject && (
                  <div className="ml-6 p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/20 text-xs text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                    After posting, you can add sub-tasks (Catering, Flowers, DJ, etc.) with individual budgets. Providers bid on each task separately.
                  </div>
                )}

                <FormField control={form.control} name="isSyndicate" render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel className="flex items-center gap-1.5 cursor-pointer">
                        <Users className="h-4 w-4 text-teal-600" />
                        Society Syndicate (Group Buy)
                      </FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Pool your requirement with neighbours. Providers see "Bulk Deal" and bid lower.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-syndicate" />
                    </FormControl>
                  </FormItem>
                )} />
                {isSyndicate && (
                  <div className="ml-6 p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/20 text-xs text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
                    A shareable link will be generated after posting. Anyone joining the syndicate strengthens the group's bargaining power.
                  </div>
                )}

                <FormField control={form.control} name="jugaadMode" render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel className="flex items-center gap-1.5 cursor-pointer">
                        <MessageSquare className="h-4 w-4 text-orange-500" />
                        Jugaad Mode
                      </FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Don't know the category? Just describe your problem in plain language.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-jugaad" />
                    </FormControl>
                  </FormItem>
                )} />
                {jugaadMode && (
                  <div className="ml-6 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-xs text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                    Your post will be shown with a "Jugaad" badge. Providers from all categories can suggest solutions.
                  </div>
                )}
              </CardContent>
            </Card>

                <Button type="submit" size="lg" className="w-full font-semibold" disabled={createMutation.isPending} data-testid="button-submit">
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <PlusCircle className="h-4 w-4 mr-2" />
                  )}
                  Post Requirement
                </Button>
              </form>
            </Form>
          </div>

          <div className="lg:col-span-5">
            <RequirementQuickTips
              activeSection={activeSection}
              selectedCategory={selectedCategory}
              title={title}
              description={description}
              city={city}
              state={state}
              maxBudget={maxBudget}
              deadlineHours={deadlineHours}
              isRecurring={isRecurring}
              recurringInterval={recurringInterval}
              isMegaProject={isMegaProject}
              isSyndicate={isSyndicate}
              jugaadMode={jugaadMode}
              customData={customData}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
