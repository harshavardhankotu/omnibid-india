import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useRegister } from "@omnibid/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Gavel, Loader2, ShoppingCart, Building2, UserCheck, Users2 } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["retail_buyer", "enterprise_buyer", "solo_provider", "agency_provider"]),
  city: z.string().optional(),
  state: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const roleOptions = [
  {
    value: "retail_buyer",
    label: "Retail Buyer",
    icon: ShoppingCart,
    desc: "Post jobs, pay via UPI/Card",
    badge: "B2C",
    badgeColor: "bg-blue-100 text-blue-700",
  },
  {
    value: "enterprise_buyer",
    label: "Enterprise Buyer",
    icon: Building2,
    desc: "Post RFPs, TDS invoices, vendor lists",
    badge: "B2B",
    badgeColor: "bg-purple-100 text-purple-700",
  },
  {
    value: "solo_provider",
    label: "Solo Provider",
    icon: UserCheck,
    desc: "Bid on jobs, KYC required",
    badge: "Worker",
    badgeColor: "bg-green-100 text-green-700",
  },
  {
    value: "agency_provider",
    label: "Agency / Fleet",
    icon: Users2,
    desc: "Manage teams, win large contracts",
    badge: "Agency",
    badgeColor: "bg-orange-100 text-orange-700",
  },
];

export default function Register() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", phone: "", password: "", role: "retail_buyer", city: "", state: "" },
  });

  const selectedRole = form.watch("role");

  const isProviderRole = selectedRole === "solo_provider" || selectedRole === "agency_provider";
  const isEnterpriseRole = selectedRole === "enterprise_buyer" || selectedRole === "agency_provider";

  const onSubmit = (data: FormData) => {
    registerMutation.mutate(
      {
        data: {
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role as "buyer",
          phone: data.phone || undefined,
          city: data.city || undefined,
          state: data.state || undefined,
        },
      },
      {
        onSuccess: (res) => {
          login(res.token);
          toast({ title: "Welcome to OmniBid!", description: "Your account has been created." });
          const role = res.user.role;
          if (role === "solo_provider" || role === "agency_provider" || role === "provider" || role === "both") {
            setLocation("/dashboard/provider");
          } else {
            setLocation("/dashboard/buyer");
          }
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Registration failed";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Gavel className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg text-primary">OmniBid</span>
          </div>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>Choose the account type that fits you best</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Role Selection — 4 Limber roles */}
              <div>
                <p className="text-sm font-medium mb-2">I am a…</p>
                <div className="grid grid-cols-2 gap-2">
                  {roleOptions.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = selectedRole === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => form.setValue("role", opt.value as FormData["role"])}
                        className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border-2 transition-all text-left ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                        data-testid={`button-role-${opt.value}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${opt.badgeColor}`}>{opt.badge}</span>
                        </div>
                        <span className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {isEnterpriseRole && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    GST Number is mandatory for Enterprise Buyers and Agency Providers. You'll be prompted to complete your Compliance Vault after signup.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input placeholder="Ravi Kumar" data-testid="input-name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input placeholder="ravi@example.com" type="email" data-testid="input-email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (optional)</FormLabel>
                    <FormControl><Input placeholder="9876543210" data-testid="input-phone" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel>City (optional)</FormLabel>
                    <FormControl><Input placeholder="Bangalore" data-testid="input-city" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Password</FormLabel>
                    <FormControl><Input placeholder="••••••••" type="password" data-testid="input-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {isProviderRole && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 dark:text-blue-300 dark:bg-blue-950/30 dark:border-blue-800 rounded-lg px-3 py-2">
                  KYC (Aadhaar / PAN) verification will be required via the Compliance Vault before you can bid.
                </p>
              )}

              <Button type="submit" className="w-full font-semibold" disabled={registerMutation.isPending} data-testid="button-submit">
                {registerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
              </Button>
            </form>
          </Form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline" data-testid="link-login">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
