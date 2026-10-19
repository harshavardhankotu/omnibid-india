import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RazorpayCheckoutModal } from "@/components/razorpay-checkout-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useListNotifications } from "@omnibid/api-client-react";
import {
  Bell,
  BarChart3,
  ChevronDown,
  FlaskConical,
  Gavel,
  Gift,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Scale,
  Settings,
  Shield,
  Sparkles,
  User,
  CreditCard,
  IndianRupee,
  TrendingUp,
  MapPin,
  Globe,
  Coins,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const [, setLocation] = useLocation();

  const { data: notifs } = useListNotifications({
    query: { enabled: !!user, queryKey: ["notifications"] },
  });
  const unreadCount = notifs?.filter((n) => !n.isRead).length ?? 0;

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const [showProModal, setShowProModal] = useState(false);

  const isPro =
    (user as any)?.subscriptionTier === "pro" ||
    (user as any)?.subscription_tier === "pro" ||
    (typeof window !== "undefined" && localStorage.getItem("omnibid_pro_active") === "true");

  const isProvider =
    user?.role === "provider" ||
    user?.role === "both" ||
    user?.role === "solo_provider" ||
    user?.role === "agency_provider";

  const isBuyer =
    user?.role === "buyer" ||
    user?.role === "both" ||
    user?.role === "retail_buyer" ||
    user?.role === "enterprise_buyer";

  const isAdmin = (user?.trustScore ?? 0) >= 100 || user?.email?.endsWith?.("@omnibid.admin");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 font-bold text-lg text-primary">
                <Gavel className="h-5 w-5" />
                <span>OmniBid</span>
              </Link>
              <nav className="hidden md:flex items-center gap-4">
                <Link href="/requirements" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {t("browse")}
                </Link>
                {isBuyer && (
                  <Link href="/requirements/new" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {t("post_problem")}
                  </Link>
                )}
                {user && (
                  <Link href="/analytics" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {t("analytics")}
                  </Link>
                )}
                {user && (
                  <Link href="/market" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {t("market")}
                  </Link>
                )}
              </nav>
            </div>

            <div className="flex items-center gap-2">
              {/* Bharat Multilingual Switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="px-2 text-xs flex items-center gap-1 font-semibold" title="Change Language">
                    <Globe className="h-3.5 w-3.5 text-primary" />
                    <span>{language === "hi" ? "हिन्दी" : language === "te" ? "తెలుగు" : "EN"}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem onClick={() => setLanguage("en")}>
                    English
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLanguage("hi")}>
                    हिन्दी (Hindi)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLanguage("te")}>
                    తెలుగు (Telugu)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* OmniBid Pro Badge / Upgrade Trigger */}
              {isPro ? (
                <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 text-[11px] font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 px-2.5 py-1 shadow-sm">
                  <Sparkles className="h-3 w-3 fill-amber-500 text-amber-500" /> PRO CONTRACTOR
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-semibold hidden sm:flex items-center gap-1 shadow-sm h-8"
                  onClick={() => setShowProModal(true)}
                  data-testid="button-upgrade-pro"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  <span>⭐ Upgrade to Pro (₹999/mo)</span>
                </Button>
              )}

              {user ? (
                <>
                  {isBuyer && (
                    <Button
                      size="sm"
                      className="hidden sm:flex"
                      onClick={() => setLocation("/requirements/new")}
                      data-testid="button-post-problem"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      {t("post_problem")}
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    onClick={() => setLocation("/notifications")}
                    data-testid="button-notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center bg-destructive text-destructive-foreground">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </Badge>
                    )}
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="flex items-center gap-1" data-testid="button-user-menu">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {user.name[0]}
                        </div>
                        <span className="hidden sm:inline text-sm">{user.name.split(" ")[0]}</span>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {isPro ? (
                        <div className="px-2 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-500/10 rounded-sm mb-1">
                          <Sparkles className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> PRO CONTRACTOR ACTIVE
                        </div>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => setShowProModal(true)}
                          className="text-amber-600 dark:text-amber-400 font-semibold cursor-pointer"
                        >
                          <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
                          ⭐ Upgrade to Pro (₹999/mo)
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {isBuyer && (
                        <DropdownMenuItem onClick={() => setLocation("/dashboard/buyer")} data-testid="menu-buyer-dashboard">
                          <LayoutDashboard className="h-4 w-4 mr-2" />
                          Buyer Dashboard
                        </DropdownMenuItem>
                      )}
                      {isProvider && (
                        <DropdownMenuItem onClick={() => setLocation("/dashboard/provider")} data-testid="menu-provider-dashboard">
                          <LayoutDashboard className="h-4 w-4 mr-2" />
                          Provider Dashboard
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setLocation(`/profile/${user.id}`)} data-testid="menu-profile">
                        <User className="h-4 w-4 mr-2" />
                        Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLocation("/analytics")} data-testid="menu-analytics">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Analytics
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLocation("/referral")} data-testid="menu-referral">
                        <Gift className="h-4 w-4 mr-2" />
                        Refer &amp; Earn
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLocation("/finance")} data-testid="menu-finance">
                        <IndianRupee className="h-4 w-4 mr-2" />
                        Finance &amp; Loans
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLocation("/market")} data-testid="menu-market">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Market Intelligence
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLocation("/tracking")} data-testid="menu-tracking">
                        <MapPin className="h-4 w-4 mr-2" />
                        GPS Tracking
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLocation("/settings")} data-testid="menu-settings">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setLocation("/compliance")} data-testid="menu-compliance">
                        <Shield className="h-4 w-4 mr-2" />
                        Compliance Vault
                      </DropdownMenuItem>
                      {isProvider && (
                        <DropdownMenuItem onClick={() => setLocation("/subscriptions")} data-testid="menu-subscriptions">
                          <CreditCard className="h-4 w-4 mr-2" />
                          Plans
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setLocation("/disputes")} data-testid="menu-disputes">
                        <Scale className="h-4 w-4 mr-2" />
                        Disputes
                      </DropdownMenuItem>
                      {isAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setLocation("/admin/revenue")} data-testid="menu-revenue-center">
                            <Coins className="h-4 w-4 mr-2 text-emerald-600" />
                            <span className="font-semibold text-emerald-600">Revenue Center</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation("/admin")} data-testid="menu-admin">
                            <Shield className="h-4 w-4 mr-2 text-red-500" />
                            <span className="text-red-600">Admin Panel</span>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setLocation("/qa")} data-testid="menu-qa">
                        <FlaskConical className="h-4 w-4 mr-2 text-orange-500" />
                        <span className="text-orange-600">QA / Demo</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout} className="text-destructive" data-testid="menu-logout">
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setLocation("/login")} data-testid="button-login">
                    {t("login")}
                  </Button>
                  <Button size="sm" onClick={() => setLocation("/register")} data-testid="button-register">
                    {t("join_free")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      <RazorpayCheckoutModal
        isOpen={showProModal}
        onClose={() => setShowProModal(false)}
        type="pro_subscription"
        onSuccess={() => {
          localStorage.setItem("omnibid_pro_active", "true");
        }}
      />
    </div>
  );
}
