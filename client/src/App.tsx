import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/protected-route";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Requirements from "@/pages/requirements";
import NewRequirement from "@/pages/new-requirement";
import RequirementDetail from "@/pages/requirement-detail";
import NewBid from "@/pages/new-bid";
import BuyerDashboard from "@/pages/buyer-dashboard";
import ProviderDashboard from "@/pages/provider-dashboard";
import Profile from "@/pages/profile";
import Notifications from "@/pages/notifications";
import Subscriptions from "@/pages/subscriptions";
import Disputes from "@/pages/disputes";
import Compliance from "@/pages/compliance";
import Negotiate from "@/pages/negotiate";
import PaymentDetail from "@/pages/payment-detail";
import Settings from "@/pages/settings";
import Analytics from "@/pages/analytics";
import Referral from "@/pages/referral";
import Admin from "@/pages/admin";
import QA from "@/pages/qa";
import Finance from "@/pages/finance";
import MarketIntelligence from "@/pages/market-intelligence";
import Tracking from "@/pages/tracking";
import AdvancedAuction from "@/pages/advanced-auction";
import AdminDashboard from "@/pages/admin-dashboard";
import MarketplacePage from "@/pages/marketplace";
import EscrowCheckoutPage from "@/pages/escrow-checkout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/marketplace" component={MarketplacePage} />
      <Route path="/escrow/checkout/:bidId" component={EscrowCheckoutPage} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/requirements" component={Requirements} />
      <Route path="/requirements/new" component={NewRequirement} />
      <Route path="/requirements/:id" component={RequirementDetail} />
      <Route path="/bid/new/:requirementId" component={NewBid} />
      <Route path="/dashboard/buyer">
        <ProtectedRoute roles={["retail_buyer", "buyer"]}>
          <BuyerDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/provider">
        <ProtectedRoute roles={["solo_provider", "provider"]}>
          <ProviderDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/enterprise/dashboard">
        <ProtectedRoute roles={["enterprise_buyer"]}>
          <BuyerDashboard /> {/* Using BuyerDashboard as placeholder or creating EnterpriseDashboard */}
        </ProtectedRoute>
      </Route>
      <Route path="/agency/dashboard">
        <ProtectedRoute roles={["agency_provider"]}>
          <ProviderDashboard /> {/* Using ProviderDashboard as placeholder */}
        </ProtectedRoute>
      </Route>
      <Route path="/profile/:id" component={Profile} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/subscriptions" component={Subscriptions} />
      <Route path="/disputes" component={Disputes} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/negotiate/:requirementId/:providerId" component={Negotiate} />
      <Route path="/negotiate/:requirementId" component={Negotiate} />
      <Route path="/payment/:requirementId" component={PaymentDetail} />
      <Route path="/settings" component={Settings} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/referral" component={Referral} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/qa" component={QA} />
      <Route path="/qa/test-cases" component={QA} />
      <Route path="/finance" component={Finance} />
      <Route path="/market" component={MarketIntelligence} />
      <Route path="/tracking/:requirementId" component={Tracking} />
      <Route path="/tracking" component={Tracking} />
      <Route path="/auction/:requirementId" component={AdvancedAuction} />
      <Route component={NotFound} />
    </Switch>
  );
}

import { I18nProvider } from "@/lib/i18n";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <I18nProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </I18nProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
