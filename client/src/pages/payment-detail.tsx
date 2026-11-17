import { useState } from "react";
import { useParams, useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  useGetPayment,
  getGetPaymentQueryKey,
  useCreatePayment,
  useSubmitWorkProof,
  useApproveMilestone,
  useGetRequirement,
  getGetRequirementQueryKey,
} from "@omnibid/api-client-react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/storage";
import { ContractFeedback } from "@/components/contract-feedback";
import { QrScannerModal } from "@/components/qr-scanner-modal";
import {
  ArrowLeft, CheckCircle2, Clock, IndianRupee, Lock, QrCode, Receipt, Shield, Upload, XCircle, Loader2
} from "lucide-react";

function loadScript(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function PaymentDetail() {
  const { requirementId } = useParams<{ requirementId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [upiId, setUpiId] = useState("");
  const [mobPct, setMobPct] = useState(0);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [showProofDialog, setShowProofDialog] = useState(false);
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [disputeTitle, setDisputeTitle] = useState("");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [proofNotes, setProofNotes] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("Work completion");
  const [milestoneNum, setMilestoneNum] = useState(1);
  const [proofUrl, setProofUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadFile(
        "omnibid-vault",
        `proofs/requirement-${requirementId}-${Date.now()}.${file.name.split(".").pop()}`,
        file
      );
      setProofUrl(url);
      toast({ title: "Proof uploaded!", description: "File successfully uploaded to secure storage." });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const { data: req } = useGetRequirement(requirementId, {
    query: { queryKey: getGetRequirementQueryKey(requirementId), enabled: !!requirementId },
  });

  const { data, isLoading, refetch } = useGetPayment(requirementId, {
    query: { queryKey: getGetPaymentQueryKey(requirementId), enabled: !!requirementId },
  });

  const createPayment = useCreatePayment();
  const submitProof = useSubmitWorkProof();
  const approveMilestone = useApproveMilestone();

  const payment = data?.payment;
  const workProofs = data?.workProofs ?? [];
  const isBuyer = user?.id === req?.buyerId;
  const isProvider = req?.winningBidId && !isBuyer;

  const winningBidId = req?.winningBidId;
  const winningBid = req?.bids?.find((b: any) => b.id === winningBidId);
  const bidAmount = winningBid ? Number(winningBid.bidAmount) : 0;
  const platformFeeAmount = Math.round(bidAmount * 0.02);
  const payTotal = bidAmount + platformFeeAmount;

  const handlePay = async () => {
    if (!winningBidId) return;

    // Load Razorpay Checkout SDK script dynamically
    const scriptLoaded = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
    if (!scriptLoaded) {
      toast({
        title: "Checkout failed",
        description: "Failed to load Razorpay SDK. Please check your internet connection.",
        variant: "destructive",
      });
      return;
    }

    createPayment.mutate(
      {
        requirementId,
        data: {
          bidId: winningBidId,
          mobilizationAdvancePct: mobPct,
          upiId: upiId || undefined,
          totalMilestones: 1,
        },
      },
      {
        onSuccess: async (res: any) => {
          const { razorpayOrderId, amount, currency, keyId } = res;

          const options = {
            key: keyId,
            amount: amount,
            currency: currency,
            name: "OmniBid India Escrow",
            description: `Payment for escrow: ${req?.title || "Bid Payment"}`,
            order_id: razorpayOrderId,
            handler: async function (response: any) {
              try {
                const token = localStorage.getItem("omnibid_token");
                const verifyRes = await fetch(`/api/requirements/${requirementId}/payment/verify-signature`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                  }),
                });

                if (!verifyRes.ok) {
                  throw new Error("Payment signature verification failed.");
                }

                setShowPayDialog(false);
                refetch();
                toast({
                  title: "Payment secured in Escrow!",
                  description: "Your funds have been verified and locked in the secure vault.",
                });
              } catch (err) {
                toast({
                  title: "Verification failed",
                  description: "Could not verify Razorpay signature with backend.",
                  variant: "destructive",
                });
              }
            },
            prefill: {
              name: user?.name || "",
              email: user?.email || "",
            },
            theme: {
              color: "#0f766e",
            },
          };

          const rzp = new (window as any).Razorpay(options);
          rzp.on("payment.failed", function (response: any) {
            toast({
              title: "Payment failed",
              description: response.error.description || "The checkout session was unsuccessful.",
              variant: "destructive",
            });
          });
          rzp.open();
        },
        onError: () => toast({ title: "Failed to initiate payment intent", variant: "destructive" }),
      }
    );
  };

  const handleSubmitProof = () => {
    if (!proofNotes.trim()) return;
    submitProof.mutate(
      {
        requirementId,
        data: {
          milestoneNumber: milestoneNum,
          milestoneTitle,
          notes: proofNotes,
          proofUrl: proofUrl || undefined,
        },
      },
      {
        onSuccess: () => {
          setShowProofDialog(false);
          setProofNotes("");
          setProofUrl("");
          qc.invalidateQueries({ queryKey: getGetPaymentQueryKey(requirementId) });
          toast({ title: "Work proof submitted!", description: "Waiting for buyer approval." });
        },
        onError: () => toast({ title: "Failed to submit proof", variant: "destructive" }),
      }
    );
  };

  const handleApprove = (proofId: string, approved: boolean) => {
    approveMilestone.mutate(
      {
        requirementId,
        data: { workProofId: proofId, approved },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetPaymentQueryKey(requirementId) });
          toast({
            title: approved ? "Milestone approved! Payment released." : "Milestone rejected.",
            description: approved ? "The provider has been notified and funds released." : "Provider can resubmit.",
          });
        },
        onError: () => toast({ title: "Failed", variant: "destructive" }),
      }
    );
  };

  const handleRaiseDispute = async () => {
    try {
      setDisputing(true);
      const token = localStorage.getItem("omnibid_token");
      const resp = await fetch(`/api/requirements/${requirementId}/dispute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: disputeTitle || undefined,
          description: disputeDesc || undefined,
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to trigger dispute flow.");
      }

      setShowDisputeDialog(false);
      setDisputeTitle("");
      setDisputeDesc("");
      qc.invalidateQueries({ queryKey: getGetPaymentQueryKey(requirementId) });
      qc.invalidateQueries({ queryKey: getGetRequirementQueryKey(requirementId) });
      refetch();
      toast({
        title: "Dispute Raised Successfully",
        description: "Funds are frozen. Our administrators have been alerted.",
      });
    } catch (err: any) {
      toast({
        title: "Failed to raise dispute",
        description: err.message || String(err),
        variant: "destructive",
      });
    } finally {
      setDisputing(false);
    }
  };

  const escrowStatusColor: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    held: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    released: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    disputed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    refunded: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation(`/requirements/${requirementId}`)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-lg font-bold">UPI Escrow Payment</h1>
              {req && <p className="text-xs text-muted-foreground">{req.title}</p>}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowQrScanner(true)}
            data-testid="button-verify-receipt-qr"
          >
            <QrCode className="h-4 w-4 mr-1.5" />
            Verify Receipt QR
          </Button>
        </div>

        <QrScannerModal
          open={showQrScanner}
          onOpenChange={setShowQrScanner}
          defaultFocus="receipt"
        />

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : !payment ? (
          /* No payment yet — show initiation UI for buyer */
          isBuyer && winningBidId ? (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <IndianRupee className="h-5 w-5 text-primary" />
                  Initiate UPI Escrow Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-400">
                  <Shield className="h-4 w-4 inline mr-1.5" />
                  Funds are held securely in escrow and released only when you approve the provider's work.
                </div>

                <div>
                  <Label htmlFor="upi-id">Your UPI ID (optional)</Label>
                  <Input
                    id="upi-id"
                    className="mt-1.5"
                    placeholder="yourname@upi or 9876543210@paytm"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Mobilization Advance</Label>
                  <p className="text-xs text-muted-foreground mb-2">Release a portion upfront to help the provider get started.</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 10, 20, 30].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setMobPct(pct)}
                        className={`py-2 rounded-lg border text-sm font-medium transition-all ${mobPct === pct ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                      >
                        {pct === 0 ? "None" : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full font-semibold"
                  onClick={() => setShowPayDialog(true)}
                >
                  <IndianRupee className="h-4 w-4 mr-1.5" />
                  Pay & Lock in Escrow
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Lock className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Payment not initiated yet. Waiting for buyer.</p>
            </div>
          )
        ) : (
          /* Payment exists — show escrow dashboard */
          <>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Escrow Status</CardTitle>
                  <Badge className={`text-xs capitalize ${escrowStatusColor[payment.escrowStatus] ?? ""}`}>
                    {payment.escrowStatus.replace("_", " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Disputed status banner */}
                {payment.escrowStatus === "disputed" && (
                  <div className="p-4 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20 space-y-2">
                    <div className="flex items-center gap-3">
                      <XCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-red-800 dark:text-red-300">Escrow Frozen (Disputed)</p>
                        <p className="text-xs text-red-700/80 dark:text-red-400/70">
                          A dispute has been raised. Escrow funds are locked. Administrators have been notified to review the project details.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Total Amount</div>
                    <div className="font-bold text-lg flex items-center gap-0.5">
                      <IndianRupee className="h-3.5 w-3.5" />
                      {payment.totalAmount.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                    <div className="text-xs text-muted-foreground">Provider Receives</div>
                    <div className="font-bold text-lg text-green-700 dark:text-green-400 flex items-center gap-0.5">
                      <IndianRupee className="h-3.5 w-3.5" />
                      {payment.netToProvider.toLocaleString("en-IN")}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Platform fee ({payment.platformFeePercent}%)</span>
                    <span>-₹{payment.platformFeeAmount.toLocaleString("en-IN")}</span>
                  </div>
                  {payment.tdsAmount > 0 && (
                    <div className="flex justify-between">
                      <span>TDS deducted (2% — above ₹30,000)</span>
                      <span>-₹{payment.tdsAmount.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {payment.mobilizationAdvancePct > 0 && (
                    <div className="flex justify-between font-medium text-blue-600 dark:text-blue-400">
                      <span>Mobilization advance ({payment.mobilizationAdvancePct}%) — {payment.advanceReleased ? "Released" : "Pending"}</span>
                      <span>₹{Math.round(payment.netToProvider * payment.mobilizationAdvancePct / 100).toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-green-600 dark:text-green-400 font-medium pt-1 border-t">
                    <span>UPI Transaction ID</span>
                    <span className="font-mono">{payment.upiTransactionId}</span>
                  </div>
                </div>

                {/* Milestones progress */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium">Milestones</span>
                    <span className="text-muted-foreground">{payment.milestonesCompleted}/{payment.totalMilestones} approved</span>
                  </div>
                  <Progress value={(payment.milestonesCompleted / payment.totalMilestones) * 100} className="h-2" />
                </div>

                {/* Raise Dispute CTA */}
                {(isBuyer || isProvider) && (payment.escrowStatus === "held" || payment.escrowStatus === "in_progress") && (
                  <Button
                    variant="outline"
                    className="w-full border-red-200 hover:border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/10 font-semibold mt-2"
                    onClick={() => setShowDisputeDialog(true)}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Raise Dispute / Freeze Funds
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Work Proofs */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Work Proofs & Milestones
                  </CardTitle>
                  {isProvider && payment.escrowStatus !== "released" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => setShowProofDialog(true)}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      Submit Proof
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {workProofs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No work proofs submitted yet.
                    {isProvider && " Submit your first milestone proof above."}
                  </p>
                )}
                {workProofs.map((proof) => (
                  <div
                    key={proof.id}
                    className={`rounded-xl border p-3 ${proof.buyerApproved ? "border-green-300 bg-green-50 dark:bg-green-950/10" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">Milestone {proof.milestoneNumber}: {proof.milestoneTitle}</span>
                          {proof.buyerApproved ? (
                            <Badge className="text-[10px] bg-green-500 text-white px-1.5">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 inline" />Approved
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] px-1.5">Pending Review</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3 inline mr-0.5" />
                          {new Date(proof.submittedAt).toLocaleDateString("en-IN")}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm mt-2 text-foreground/80">{proof.notes}</p>
                    {proof.buyerNote && (
                      <p className="text-xs mt-1.5 text-muted-foreground bg-muted/50 rounded-lg p-2">
                        Buyer note: {proof.buyerNote}
                      </p>
                    )}

                    {isBuyer && !proof.buyerApproved && (
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprove(proof.id, true)}
                          disabled={approveMilestone.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          Approve & Release Payment
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => handleApprove(proof.id, false)}
                          disabled={approveMilestone.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {winningBid && (req?.status === "completed" || payment.escrowStatus === "released") && (
              <ContractFeedback
                requirementId={requirementId}
                requirementTitle={req?.title}
                providerId={winningBid.providerId}
                providerName={winningBid.providerName}
                contractStatus={req?.status ?? "completed"}
                isBuyer={isBuyer}
              />
            )}
          </>
        )}
      </div>

      {/* Pay confirmation dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-teal-800 dark:text-teal-300">
              <Shield className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Secure Escrow Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 my-2">
            <div className="p-3.5 rounded-xl bg-teal-50/50 dark:bg-teal-950/10 border border-teal-100 dark:border-teal-900/50 text-xs text-teal-800 dark:text-teal-300 flex items-start gap-2.5">
              <Lock className="h-4 w-4 mt-0.5 flex-shrink-0 text-teal-600 dark:text-teal-400" />
              <p>
                Funds are held in a secure trust account and released in parts only as you approve provider work milestones.
              </p>
            </div>

            <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Provider Bid Amount</span>
                <span className="font-medium flex items-center gap-0.5">
                  <IndianRupee className="h-3.5 w-3.5" />
                  {bidAmount.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Platform Fee (2%)</span>
                <span className="font-medium flex items-center gap-0.5 text-teal-600 dark:text-teal-400">
                  <IndianRupee className="h-3.5 w-3.5" />
                  {platformFeeAmount.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="border-t pt-3 flex justify-between items-center text-base font-bold">
                <span className="text-foreground">Total Escrow Capital</span>
                <span className="flex items-center gap-0.5 text-teal-700 dark:text-teal-400">
                  <IndianRupee className="h-4 w-4" />
                  {payTotal.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300">
              💡 <strong>Razorpay Sandbox Mode:</strong> Clicking below will launch the official Razorpay test portal. You can complete the checkout simulation by choosing any test UPI handle or dummy card.
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowPayDialog(false)}>Cancel</Button>
            <Button
              className="bg-teal-700 hover:bg-teal-800 text-white font-semibold flex items-center gap-2"
              onClick={handlePay}
              disabled={createPayment.isPending}
            >
              {createPayment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Initiating Order...
                </>
              ) : (
                <>
                  <IndianRupee className="h-4 w-4" />
                  Proceed to Checkout
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit proof dialog */}
      <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Submit Work Proof
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label htmlFor="milestone-title">Milestone title</Label>
              <Input
                id="milestone-title"
                className="mt-1.5"
                value={milestoneTitle}
                onChange={(e) => setMilestoneTitle(e.target.value)}
                placeholder="e.g. Foundation work complete"
              />
            </div>
            <div>
              <Label htmlFor="proof-notes">Work notes</Label>
              <Textarea
                id="proof-notes"
                className="mt-1.5"
                rows={4}
                value={proofNotes}
                onChange={(e) => setProofNotes(e.target.value)}
                placeholder="Describe the work completed, materials used, hours spent..."
              />
            </div>
            <div>
              <Label htmlFor="proof-file">Proof Document / Photo</Label>
              <Input
                id="proof-file"
                type="file"
                accept="image/*,application/pdf"
                className="mt-1.5 cursor-pointer"
                disabled={uploading}
                onChange={handleProofUpload}
              />
              {uploading && (
                <div className="flex items-center gap-2 text-xs text-blue-600 mt-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading to secure Supabase vault…
                </div>
              )}
              {proofUrl && (
                <div className="text-xs text-green-600 font-medium flex items-center gap-1 mt-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> File uploaded successfully!
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProofDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSubmitProof}
              disabled={!proofNotes.trim() || submitProof.isPending}
            >
              {submitProof.isPending ? "Submitting..." : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raise Dispute Dialog */}
      <Dialog open={showDisputeDialog} onOpenChange={setShowDisputeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-800 dark:text-red-300 text-lg font-bold">
              <Shield className="h-5 w-5 text-red-600" />
              Raise Payment Dispute
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              This will instantly freeze all escrow funds. You can provide a brief title and explanation for our administrators to review.
            </p>
          </DialogHeader>
          
          <div className="space-y-4 my-2 text-sm">
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10 p-3 text-xs text-red-800 dark:text-red-300">
              ⚠️ <strong>Important:</strong> Freezing the escrow stops all release payments and work approvals. It alerts system admins to arbitrate between both parties.
            </div>

            <div>
              <Label htmlFor="dispute-title">Dispute Title</Label>
              <Input
                id="dispute-title"
                className="mt-1.5"
                placeholder="e.g. Unfinished foundation work / Missing deliverables"
                value={disputeTitle}
                onChange={(e) => setDisputeTitle(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="dispute-desc">Description of Issue</Label>
              <Textarea
                id="dispute-desc"
                className="mt-1.5"
                rows={4}
                placeholder="Please describe in detail what went wrong, including milestones, deliverables, and any agreement violations..."
                value={disputeDesc}
                onChange={(e) => setDisputeDesc(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDisputeDialog(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5"
              onClick={handleRaiseDispute}
              disabled={disputing}
            >
              {disputing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Freezing Funds...
                </>
              ) : (
                "Confirm Dispute & Freeze"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
