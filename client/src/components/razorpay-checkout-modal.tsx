import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  IndianRupee,
  Lock,
  ArrowRight,
  Smartphone,
  Building2,
} from "lucide-react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface RazorpayCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "lead_unlock" | "pro_subscription" | "escrow_deposit";
  requirementId?: string;
  bidId?: string;
  bidAmount?: number;
  sellerGstinOrPan?: string;
  requirementTitle?: string;
  onSuccess?: (paymentDetails: any) => void;
}

export function RazorpayCheckoutModal({
  isOpen,
  onClose,
  type,
  requirementId,
  bidId,
  bidAmount,
  sellerGstinOrPan,
  requirementTitle,
  onSuccess,
}: RazorpayCheckoutModalProps) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [orderDetails, setOrderDetails] = useState<{
    orderId: string;
    grossAmountPaise: number;
    platformFeePaise: number;
    tdsPaise: number;
    netSettlementPaise: number;
    keyId: string;
    currency: string;
    type: string;
  } | null>(null);

  // Load Razorpay script dynamically
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Razorpay) return;

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Fetch or initialize order when modal opens
  useEffect(() => {
    if (!isOpen) {
      setOrderDetails(null);
      setIsProcessingPayment(false);
      return;
    }

    const initOrder = async () => {
      setIsLoadingOrder(true);
      try {
        const token = localStorage.getItem("omnibid_token");
        const res = await fetch("/api/payments/create-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            type,
            requirementId,
            bidId,
            sellerGstinOrPan,
            bidAmount,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to create payment order");
        }

        const data = await res.json();
        setOrderDetails(data);
      } catch (err: any) {
        console.error("Order creation error:", err);
        toast({
          title: "Order Initialization Failed",
          description: err?.message || "Could not prepare order with Razorpay.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingOrder(false);
      }
    };

    initOrder();
  }, [isOpen, type, requirementId, bidId, bidAmount, sellerGstinOrPan, toast]);

  // Handle standard Razorpay Checkout Launch
  const handleLaunchRazorpay = async () => {
    if (!orderDetails) return;

    setIsProcessingPayment(true);
    const token = localStorage.getItem("omnibid_token");

    const options = {
      key: orderDetails.keyId,
      amount: orderDetails.grossAmountPaise,
      currency: orderDetails.currency || "INR",
      name: "OmniBid India",
      description:
        type === "lead_unlock"
          ? "Direct Buyer Contact Lead Fee"
          : type === "pro_subscription"
          ? "OmniBid Pro Contractor Subscription"
          : "Milestone Escrow Deposit",
      image: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
      order_id: orderDetails.orderId,
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        try {
          const verifyRes = await fetch("/api/payments/verify-checkout", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              razorpayOrderId: response.razorpay_order_id || orderDetails.orderId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          });

          if (!verifyRes.ok) {
            const errData = await verifyRes.json().catch(() => ({}));
            throw new Error(errData.error || "Payment verification failed");
          }

          if (type === "pro_subscription") {
            localStorage.setItem("omnibid_pro_active", "true");
          }

          toast({
            title: "🎉 Payment Successful!",
            description:
              type === "lead_unlock"
                ? "Buyer contact details unlocked. You can now connect directly on WhatsApp!"
                : type === "pro_subscription"
                ? "Welcome to OmniBid Pro! Unlimited bids & golden badge active."
                : "Escrow funds securely deposited and held in vault.",
          });

          onSuccess?.(response);
          onClose();
        } catch (verifyErr: any) {
          toast({
            title: "Verification Error",
            description: verifyErr?.message || "Failed to confirm payment signature.",
            variant: "destructive",
          });
        } finally {
          setIsProcessingPayment(false);
        }
      },
      prefill: {
        name: "OmniBid User",
        email: "user@omnibid.in",
        contact: "+919876543210",
      },
      theme: {
        color: "#16a34a",
      },
      modal: {
        ondismiss: () => {
          setIsProcessingPayment(false);
        },
      },
    };

    if (window.Razorpay && !orderDetails.keyId.includes("dummy")) {
      try {
        const rzp = new window.Razorpay(options);
        rzp.open();
        return;
      } catch (e) {
        console.warn("Razorpay window launch error, switching to simulation:", e);
      }
    }

    // In test/dummy mode, simulate completion smoothly
    await handleSimulatedPayment();
  };

  // Automated instant checkout simulation for test/sandbox mode
  const handleSimulatedPayment = async () => {
    if (!orderDetails) return;
    setIsProcessingPayment(true);
    const token = localStorage.getItem("omnibid_token");

    try {
      const mockPaymentId = `pay_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const res = await fetch("/api/payments/verify-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          razorpayOrderId: orderDetails.orderId,
          razorpayPaymentId: mockPaymentId,
          razorpaySignature: "mock_signature_valid",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Simulation verification failed");
      }

      if (type === "pro_subscription") {
        localStorage.setItem("omnibid_pro_active", "true");
      }

      toast({
        title: "✅ Payment Confirmed (Test Mode)",
        description:
          type === "lead_unlock"
            ? "Direct Buyer Contact Unlocked!"
            : type === "pro_subscription"
            ? "Pro Subscription Activated with DigiLocker badge!"
            : "Escrow Locked & Requirement Status updated to In Escrow!",
      });

      onSuccess?.({
        razorpay_order_id: orderDetails.orderId,
        razorpay_payment_id: mockPaymentId,
      });
      onClose();
    } catch (err: any) {
      toast({
        title: "Payment Error",
        description: err?.message || "Failed to verify transaction.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const grossInr = orderDetails ? orderDetails.grossAmountPaise / 100 : (type === "lead_unlock" ? 99 : type === "pro_subscription" ? 999 : bidAmount || 0);
  const platformFeeInr = orderDetails ? orderDetails.platformFeePaise / 100 : (type === "lead_unlock" ? 99 : type === "pro_subscription" ? 999 : grossInr * 0.02);
  const tdsInr = orderDetails ? orderDetails.tdsPaise / 100 : 0;
  const netInr = orderDetails ? orderDetails.netSettlementPaise / 100 : Math.max(0, grossInr - platformFeeInr - tdsInr);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            {type === "pro_subscription" ? (
              <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> PRO CONTRACTOR
              </Badge>
            ) : type === "lead_unlock" ? (
              <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1">
                <Smartphone className="h-3.5 w-3.5" /> INSTANT LEAD ACCESS
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> 100% ESCROW TRUST
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">
            {type === "lead_unlock"
              ? t("unlock_buyer_contact")
              : type === "pro_subscription"
              ? t("pro_upgrade")
              : t("fund_escrow")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {requirementTitle ? `Requirement: ${requirementTitle}` : "Secure UPI, NetBanking & Card checkout powered by Razorpay"}
          </DialogDescription>
        </DialogHeader>

        {isLoadingOrder ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Initializing Razorpay Order...</p>
          </div>
        ) : (
          <div className="space-y-4 my-2">
            {/* Financial Breakdown Card */}
            <div className="p-4 rounded-xl border border-border bg-muted/40 space-y-2.5 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Gross Payable</span>
                <span className="font-semibold text-foreground">₹{grossInr.toLocaleString("en-IN")}</span>
              </div>

              {type === "escrow_deposit" && (
                <>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {t("platform_fee")}
                    </span>
                    <span className="font-medium text-foreground">₹{platformFeeInr.toLocaleString("en-IN")}</span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {t("tds_deduction")} {grossInr > 30000 ? "(Sec 194C)" : "(Exempt ≤ ₹30k)"}
                    </span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      -₹{tdsInr.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="border-t border-border pt-2 flex items-center justify-between font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400">{t("net_payout")}</span>
                    <span className="text-emerald-600 dark:text-emerald-400">₹{netInr.toLocaleString("en-IN")}</span>
                  </div>
                </>
              )}

              {type === "lead_unlock" && (
                <div className="border-t border-border pt-2 flex items-center justify-between font-bold">
                  <span>Total Unlock Fee</span>
                  <span className="text-primary">₹99</span>
                </div>
              )}

              {type === "pro_subscription" && (
                <div className="border-t border-border pt-2 flex items-center justify-between font-bold">
                  <span>Pro Plan (Monthly)</span>
                  <span className="text-amber-600 dark:text-amber-400">₹999 / mo</span>
                </div>
              )}
            </div>

            {/* Supported payment rails */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <Lock className="h-3.5 w-3.5 text-primary" /> Supported Rails:
              </span>
              <div className="flex items-center gap-2 font-medium">
                <span className="px-1.5 py-0.5 rounded bg-muted">UPI</span>
                <span className="px-1.5 py-0.5 rounded bg-muted">Cards</span>
                <span className="px-1.5 py-0.5 rounded bg-muted">NetBanking</span>
              </div>
            </div>

            {/* Security Guarantee */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                {type === "escrow_deposit"
                  ? "Escrow protection under RBI Section 10(2) PSS Act. Funds are disbursed to contractor only upon your milestone approval."
                  : type === "pro_subscription"
                  ? "Pro Contractor status includes DigiLocker verification badge, priority L1 ranking & zero transaction platform surcharges."
                  : "Direct buyer unlock includes verified phone number, company email, and 1-click WhatsApp conversation link."}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={isProcessingPayment}>
            Cancel
          </Button>

          <Button
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-semibold flex items-center justify-center gap-1.5"
            onClick={handleLaunchRazorpay}
            disabled={isLoadingOrder || isProcessingPayment}
          >
            {isProcessingPayment ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Processing...
              </>
            ) : (
              <>
                <IndianRupee className="h-4 w-4" /> Pay ₹{grossInr.toLocaleString("en-IN")} via Razorpay
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export default RazorpayCheckoutModal;
