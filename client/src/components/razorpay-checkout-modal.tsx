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
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  QrCode,
  Copy,
  ExternalLink,
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

  const [activeTab, setActiveTab] = useState<"upi_qr" | "razorpay">("upi_qr");
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isVerifyingUtr, setIsVerifyingUtr] = useState(false);
  const [utrNumber, setUtrNumber] = useState("");
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Direct UPI QR State
  const [upiQrData, setUpiQrData] = useState<{
    transactionId: string;
    upiUri: string;
    qrImageUrl: string;
    amountInr: number;
    merchantUpiId: string;
    note: string;
  } | null>(null);

  // Razorpay Order State
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

  // Fetch or initialize order and UPI QR when modal opens
  useEffect(() => {
    if (!isOpen) {
      setOrderDetails(null);
      setUpiQrData(null);
      setUtrNumber("");
      setIsProcessingPayment(false);
      setIsVerifyingUtr(false);
      return;
    }

    const initPaymentOptions = async () => {
      setIsLoadingOrder(true);
      const token = localStorage.getItem("omnibid_token");

      try {
        // 1. Generate Direct UPI QR
        const upiRes = await fetch("/api/payments/generate-upi-qr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            type,
            requirementId,
            bidId,
            amountInr: bidAmount,
          }),
        });

        if (upiRes.ok) {
          const upiData = await upiRes.json();
          setUpiQrData(upiData);
        }

        // 2. Prepare Razorpay order
        const rzpRes = await fetch("/api/payments/create-order", {
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

        if (rzpRes.ok) {
          const rzpData = await rzpRes.json();
          setOrderDetails(rzpData);
        }
      } catch (err: any) {
        console.warn("Payment initialization notice:", err);
      } finally {
        setIsLoadingOrder(false);
      }
    };

    initPaymentOptions();
  }, [isOpen, type, requirementId, bidId, bidAmount, sellerGstinOrPan]);

  // Copy Merchant UPI ID
  const handleCopyUpiId = () => {
    if (!upiQrData?.merchantUpiId) return;
    navigator.clipboard.writeText(upiQrData.merchantUpiId);
    setCopiedUpi(true);
    toast({
      title: "UPI ID Copied",
      description: `Copied ${upiQrData.merchantUpiId} to clipboard. Pay via any UPI app.`,
    });
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  // Verify 12-Digit UTR
  const handleVerifyUtr = async () => {
    if (!utrNumber || utrNumber.trim().length < 8) {
      toast({
        title: "Invalid UTR",
        description: "Please enter a valid 12-digit UPI reference (UTR) from your bank SMS / UPI app.",
        variant: "destructive",
      });
      return;
    }

    setIsVerifyingUtr(true);
    const token = localStorage.getItem("omnibid_token");

    try {
      const res = await fetch("/api/payments/verify-utr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          transactionId: upiQrData?.transactionId,
          utrNumber: utrNumber.trim(),
          requirementId,
          type,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to verify UTR");
      }

      const result = await res.json();

      if (type === "pro_subscription") {
        localStorage.setItem("omnibid_pro_active", "true");
      }

      toast({
        title: "🎉 Payment Verified via UPI!",
        description:
          type === "lead_unlock"
            ? "Lead unlocked! Official verified tender link & contact details are now accessible."
            : type === "pro_subscription"
            ? "OmniBid Pro Contractor status activated!"
            : "Escrow funds locked successfully.",
      });

      onSuccess?.(result);
      onClose();
    } catch (err: any) {
      toast({
        title: "UTR Verification Error",
        description: err?.message || "Could not confirm UTR reference. Please check and try again.",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingUtr(false);
    }
  };

  // Launch Razorpay Checkout
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
          ? "Direct Verified Tender & Lead Access"
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
                ? "Direct contact and official tender link unlocked!"
                : type === "pro_subscription"
                ? "Welcome to OmniBid Pro! Unlimited bids & golden badge active."
                : "Escrow funds securely deposited.",
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
        email: "contractor@omnibid.in",
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

    // In sandbox or fallback mode, verify simulated payment
    await handleSimulatedPayment();
  };

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
        title: "✅ Payment Confirmed",
        description:
          type === "lead_unlock"
            ? "Direct Buyer Contact & Official Tender Link Unlocked!"
            : type === "pro_subscription"
            ? "Pro Subscription Activated!"
            : "Escrow Locked & Requirement In Escrow!",
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

  const amountPayableInr =
    upiQrData?.amountInr ||
    (orderDetails ? orderDetails.grossAmountPaise / 100 : type === "lead_unlock" ? 99 : type === "pro_subscription" ? 999 : bidAmount || 0);

  const isRazorpayLive = !!(orderDetails && orderDetails.keyId.startsWith("rzp_live_"));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            {type === "pro_subscription" ? (
              <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> PRO CONTRACTOR PASS
              </Badge>
            ) : type === "lead_unlock" ? (
              <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1">
                <Smartphone className="h-3.5 w-3.5" /> VERIFIED TENDER & LEAD UNLOCK
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> 100% ESCROW VAULT
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">
            {type === "lead_unlock"
              ? "Unlock Verified Tender & Direct Contact"
              : type === "pro_subscription"
              ? t("pro_upgrade")
              : t("fund_escrow")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {requirementTitle ? `Requirement: ${requirementTitle}` : "Zero-MDR Direct UPI QR or Razorpay Gateway"}
          </DialogDescription>
        </DialogHeader>

        {isLoadingOrder ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Preparing Payment Channels...</p>
          </div>
        ) : (
          <div className="space-y-4 my-2">
            {/* Amount Banner */}
            <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Amount Payable</span>
                <div className="text-2xl font-black text-foreground">₹{amountPayableInr.toLocaleString("en-IN")}</div>
              </div>
              <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10">
                0% Gateway Fee via UPI
              </Badge>
            </div>

            {/* Payment Method Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="upi_qr" className="flex items-center gap-1.5 text-xs font-semibold">
                  <QrCode className="h-4 w-4 text-emerald-500" /> Instant UPI QR (0% Fee)
                </TabsTrigger>
                <TabsTrigger value="razorpay" className="flex items-center gap-1.5 text-xs font-semibold">
                  <CreditCard className="h-4 w-4 text-blue-500" />
                  {isRazorpayLive ? "Razorpay Live" : "Cards / Gateway"}
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: Direct UPI QR with UTR Verification */}
              <TabsContent value="upi_qr" className="space-y-3.5 mt-3">
                {upiQrData ? (
                  <div className="flex flex-col items-center p-3.5 rounded-xl border border-border bg-muted/20 text-center">
                    {/* QR Code Image */}
                    <div className="relative p-2 rounded-lg bg-white border border-border shadow-sm mb-2">
                      <img
                        src={upiQrData.qrImageUrl}
                        alt="Scan UPI QR"
                        className="w-48 h-48 object-contain"
                      />
                    </div>

                    <p className="text-xs font-medium text-foreground">
                      Scan with any UPI app: Google Pay, PhonePe, Paytm, BHIM, CRED
                    </p>

                    {/* Merchant UPI ID Box */}
                    <div className="mt-2.5 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background border border-border text-xs w-full justify-between">
                      <span className="text-muted-foreground font-mono truncate">
                        UPI: <span className="font-semibold text-foreground">{upiQrData.merchantUpiId}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs flex items-center gap-1 text-primary shrink-0"
                        onClick={handleCopyUpiId}
                      >
                        {copiedUpi ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedUpi ? "Copied" : "Copy"}
                      </Button>
                    </div>

                    {/* Mobile Direct Pay Link */}
                    <a
                      href={upiQrData.upiUri}
                      className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/20 border border-emerald-500/30 transition-colors"
                    >
                      <Smartphone className="h-3.5 w-3.5" /> Open in UPI App (Mobile)
                    </a>

                    {/* 12-Digit Bank UTR Verification Input */}
                    <div className="mt-4 w-full text-left space-y-1.5">
                      <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                        <span>Enter 12-Digit Bank Reference (UTR)</span>
                        <span className="text-[10px] text-muted-foreground font-normal">From bank SMS or UPI receipt</span>
                      </label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g. 429188291039"
                          value={utrNumber}
                          onChange={(e) => setUtrNumber(e.target.value)}
                          className="font-mono text-sm tracking-wider"
                          maxLength={20}
                        />
                        <Button
                          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 font-semibold text-xs"
                          onClick={handleVerifyUtr}
                          disabled={isVerifyingUtr || !utrNumber.trim()}
                        >
                          {isVerifyingUtr ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Verify & Unlock"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Unable to load UPI QR. Please switch to the Gateway tab.
                  </div>
                )}
              </TabsContent>

              {/* TAB 2: Standard Razorpay Gateway */}
              <TabsContent value="razorpay" className="space-y-3 mt-3">
                <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-2 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground text-xs">
                    <span>Base Amount</span>
                    <span className="font-semibold text-foreground">₹{amountPayableInr.toLocaleString("en-IN")}</span>
                  </div>
                  {type === "escrow_deposit" && (
                    <div className="flex items-center justify-between text-muted-foreground text-xs">
                      <span>Platform Escrow Fee (2%)</span>
                      <span className="font-medium text-foreground">
                        ₹{orderDetails ? (orderDetails.platformFeePaise / 100).toLocaleString("en-IN") : "0"}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 flex items-center justify-between font-bold text-sm">
                    <span>Total Checkout</span>
                    <span className="text-primary">₹{amountPayableInr.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Lock className="h-3.5 w-3.5 text-primary" /> Supported Rails:
                  </span>
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[11px]">UPI</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[11px]">Cards</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[11px]">NetBanking</span>
                  </div>
                </div>

                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-1.5 mt-2"
                  onClick={handleLaunchRazorpay}
                  disabled={isLoadingOrder || isProcessingPayment}
                >
                  {isProcessingPayment ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Processing Razorpay...
                    </>
                  ) : (
                    <>
                      <IndianRupee className="h-4 w-4" /> Pay ₹{amountPayableInr.toLocaleString("en-IN")} via Gateway
                    </>
                  )}
                </Button>
              </TabsContent>
            </Tabs>

            {/* Security Guarantee */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                {type === "escrow_deposit"
                  ? "Escrow protection under Section 10(2) PSS Act. Funds disbursed only upon your milestone signoff."
                  : type === "pro_subscription"
                  ? "Pro Contractor membership includes DigiLocker verification, 0% platform fee surcharges, and priority L1 tender alerts."
                  : "Lead unlock includes direct buyer contact details, verified government tender portal URL, and complete BOQ breakdown."}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between mt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isProcessingPayment || isVerifyingUtr}>
            Cancel
          </Button>
          <span className="text-[11px] text-muted-foreground">Encrypted 256-Bit TLS</span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RazorpayCheckoutModal;
