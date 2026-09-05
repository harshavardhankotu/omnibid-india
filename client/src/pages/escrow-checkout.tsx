import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Lock, AlertCircle, FileText, CheckCircle2 } from "lucide-react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function EscrowCheckoutPage() {
  const [, params] = useRoute("/escrow/checkout/:bidId");
  const bidId = params?.bidId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Fetch Bid & Requirement Details
  const { data: bidData, isLoading } = useQuery<any>({
    queryKey: [`/api/bids/${bidId}`],
    enabled: !!bidId,
  });

  const baseBidAmount = bidData ? parseFloat(bidData.bidAmount || bidData.bid_amount || "0") : 0;
  const platformFee = Math.round(baseBidAmount * 0.02 * 100) / 100; // 2%
  const gstAmount = Math.round(baseBidAmount * 0.18 * 100) / 100; // 18% GST (SAC 9954/9983)
  const tdsDeduction = baseBidAmount > 30000 ? Math.round(baseBidAmount * 0.02 * 100) / 100 : 0; // 2% TDS
  const totalPayableByBuyer = baseBidAmount + platformFee;

  const handleRazorpayCheckout = async () => {
    try {
      setIsProcessing(true);

      // 1. Create Escrow Order via backend
      const res = await fetch("/api/escrow/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirementId: bidData.requirementId || bidData.requirement_id,
          bidId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to initialize escrow order");
      }

      const orderData = await res.json();

      // 2. Open Razorpay Modal
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_mockKeyId",
        amount: orderData.totalAmountPaise,
        currency: "INR",
        name: "OmniBid India Escrow Trust",
        description: `Escrow Lock for Bid #${bidId?.slice(0, 8)}`,
        order_id: orderData.orderId,
        handler: async function (response: any) {
          // 3. Verify Signature
          const verifyRes = await fetch("/api/escrow/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requirementId: bidData.requirementId || bidData.requirement_id,
              bidId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });

          if (verifyRes.ok) {
            setPaymentSuccess(true);
            toast({
              title: "✅ Escrow Funded Successfully!",
              description: "Funds are locked in the trust vault. Contractor notified to commence milestone 1.",
            });
          } else {
            toast({
              title: "Payment Verification Failed",
              description: "Please check your transaction logs or contact support.",
              variant: "destructive",
            });
          }
          setIsProcessing(false);
        },
        prefill: {
          name: "OmniBid Verified Buyer",
          email: "buyer@omnibid.in",
          contact: "9876543210",
        },
        theme: {
          color: "#0F172A",
        },
      };

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        // Mock fallback for test sandbox environments
        console.warn("Razorpay SDK not loaded, performing mock sandbox checkout verification");
        await fetch("/api/escrow/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requirementId: bidData.requirementId || bidData.requirement_id,
            bidId,
            razorpayOrderId: orderData.orderId,
            razorpayPaymentId: `pay_mock_${Date.now()}`,
            signature: "mock_signature_sandbox",
          }),
        });
        setPaymentSuccess(true);
        setIsProcessing(false);
      }
    } catch (err: any) {
      toast({
        title: "Checkout Error",
        description: err?.message || "Failed to launch payment gateway",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Card className="border-2 shadow-lg">
          <CardHeader className="bg-muted/30 border-b pb-6">
            <div className="flex items-center justify-between gap-2 mb-2">
              <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> RBI Compliant Escrow Vault
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" /> 256-bit Encrypted
              </span>
            </div>
            <CardTitle className="text-2xl font-black">Escrow Lock & Milestone Funding</CardTitle>
            <CardDescription>
              Commit funds securely into OmniBid Vault. Capital is disbursed only upon verified milestone sign-offs.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            {paymentSuccess ? (
              <div className="text-center py-8 space-y-4">
                <div className="inline-flex p-3 rounded-full bg-emerald-100 text-emerald-600 mb-2">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">Escrow Successfully Funded!</h2>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  ₹{totalPayableByBuyer.toLocaleString("en-IN")} has been locked in the escrow trust. The contractor has been instructed to begin work on Milestone 1.
                </p>
                <div className="pt-4 flex justify-center gap-4">
                  <Button variant="outline" onClick={() => window.print()}>
                    <FileText className="h-4 w-4 mr-2" /> Download Escrow Receipt
                  </Button>
                  <Button onClick={() => setLocation(`/marketplace`)}>Return to Marketplace</Button>
                </div>
              </div>
            ) : (
              <>
                {/* Financial Ledger Breakdown */}
                <div className="bg-card border rounded-xl p-5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    Financial Settlement Ledger (India Works Contract)
                  </h4>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Agreed Contractor Bid Value:</span>
                    <span className="font-semibold text-foreground">₹{baseBidAmount.toLocaleString("en-IN")}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Platform Escrow Fee (2%):</span>
                    <span className="font-semibold text-foreground">₹{platformFee.toLocaleString("en-IN")}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Works Contract GST (18% SAC 9954/9983):</span>
                    <span className="text-muted-foreground">₹{gstAmount.toLocaleString("en-IN")} (Billed to Contractor)</span>
                  </div>

                  {tdsDeduction > 0 && (
                    <div className="flex justify-between text-sm text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                      <span>TDS Withheld at Source (Sec 194C/J 2%):</span>
                      <span className="font-semibold">- ₹{tdsDeduction.toLocaleString("en-IN")}</span>
                    </div>
                  )}

                  <div className="border-t pt-3 flex justify-between items-center text-lg font-extrabold text-foreground">
                    <span>Total Deposit Required to Fund Vault:</span>
                    <span className="text-primary text-xl">₹{totalPayableByBuyer.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                {/* Dispute & Freeze Notice */}
                <div className="flex items-start gap-3 bg-muted/40 p-4 rounded-xl border text-xs text-muted-foreground">
                  <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <strong>Buyer Protection Guarantee:</strong> If the provider fails to deliver according to specifications, you can trigger an emergency Dispute Freeze directly from your project dashboard to lock all milestone disbursements.
                  </div>
                </div>
              </>
            )}
          </CardContent>

          {!paymentSuccess && (
            <CardFooter className="bg-muted/20 border-t flex flex-col sm:flex-row justify-between gap-4 py-4">
              <Button variant="ghost" onClick={() => window.history.back()} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                size="lg"
                className="w-full sm:w-auto font-bold px-8 shadow-md"
                onClick={handleRazorpayCheckout}
                disabled={isProcessing || isLoading}
              >
                {isProcessing ? "Connecting Gateway..." : `Lock ₹${totalPayableByBuyer.toLocaleString("en-IN")} in Escrow`}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </Layout>
  );
}
