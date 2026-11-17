import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Scanner, type IDetectedBarcode, type IScannerError } from "@yudiel/react-qr-scanner";
import jsQR from "jsqr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Gavel,
  ImageUp,
  IndianRupee,
  Keyboard,
  Loader2,
  QrCode,
  Receipt,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

interface QrScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFocus?: "auto" | "auction" | "receipt";
}

interface VerifiedReceipt {
  paymentId: string;
  requirementId: string;
  requirementTitle: string;
  city: string | null;
  buyerName: string;
  providerName: string;
  totalAmount: number;
  platformFeeAmount: number;
  tdsAmount: number;
  netToProvider: number;
  escrowStatus: string;
  upiTransactionId: string | null;
  milestonesCompleted: number;
  totalMilestones: number;
  createdAt: string;
  updatedAt: string;
}

interface AuctionSessionInfo {
  id: string;
  title: string;
  city: string;
  state: string;
  maxBudget: number;
  status: string;
  bidCount: number;
  categoryName: string;
}

type ParsedQrTarget =
  | { kind: "auction"; requirementId: string; route: string }
  | { kind: "receipt"; reference: string; upiAmount?: string; upiPayee?: string }
  | { kind: "unknown"; raw: string };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseQrPayload(rawValue: string): ParsedQrTarget {
  const trimmed = rawValue.trim();
  if (!trimmed) return { kind: "unknown", raw: rawValue };

  // 1. JSON payload
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const ref = String(
        parsed.upiTransactionId || parsed.paymentId || parsed.receiptId || parsed.ref || ""
      ).trim();
      const reqId = String(parsed.requirementId || parsed.auctionId || "").trim();
      if (parsed.type === "omnibid_receipt" || parsed.type === "receipt" || ref) {
        return { kind: "receipt", reference: ref || reqId };
      }
      if (reqId) {
        return { kind: "auction", requirementId: reqId, route: `/auction/${reqId}` };
      }
    } catch {
      // fall through
    }
  }

  // 2. UPI Intent URI (upi://pay?pa=...&am=...&tn=OmniBid_<type>_<shortReqId>)
  if (trimmed.toLowerCase().startsWith("upi://pay")) {
    try {
      const url = new URL(trimmed);
      const pa = url.searchParams.get("pa") ?? undefined;
      const am = url.searchParams.get("am") ?? undefined;
      const tn = url.searchParams.get("tn") ?? "";
      const tr = url.searchParams.get("tr") ?? "";
      let ref = tr;
      if (!ref && tn) {
        const parts = tn.split("_");
        ref = parts[parts.length - 1] || tn;
      }
      return {
        kind: "receipt",
        reference: ref || trimmed,
        upiAmount: am,
        upiPayee: pa,
      };
    } catch {
      return { kind: "receipt", reference: trimmed };
    }
  }

  // 3. URL or relative path
  try {
    const url = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? new URL(trimmed)
      : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, "https://omnibid.local");
    const path = url.pathname;

    const auctionMatch = path.match(/\/auction\/([^/?#]+)/i);
    if (auctionMatch?.[1]) {
      return {
        kind: "auction",
        requirementId: auctionMatch[1],
        route: `/auction/${auctionMatch[1]}`,
      };
    }

    const reqMatch = path.match(/\/requirements\/([^/?#]+)/i);
    if (reqMatch?.[1] && reqMatch[1] !== "new") {
      return {
        kind: "auction",
        requirementId: reqMatch[1],
        route: `/requirements/${reqMatch[1]}`,
      };
    }

    const paymentMatch = path.match(/\/payment\/([^/?#]+)/i);
    if (paymentMatch?.[1]) {
      return {
        kind: "receipt",
        reference: paymentMatch[1],
      };
    }

    const checkoutMatch = path.match(/\/escrow\/checkout\/([^/?#]+)/i);
    if (checkoutMatch?.[1]) {
      return {
        kind: "receipt",
        reference: checkoutMatch[1],
      };
    }
  } catch {
    // fall through
  }

  // 4. Direct receipt/payment transaction prefix
  if (/^(pay_|order_|UPI|tx_upi_|UTR_|rcpt_)/i.test(trimmed)) {
    return { kind: "receipt", reference: trimmed };
  }

  // 5. Prefixed auction ID (e.g. omnibid:auction:<id>)
  const colonAuction = trimmed.match(/^omnibid:auction:(.+)$/i);
  if (colonAuction?.[1]) {
    const id = colonAuction[1].trim();
    return { kind: "auction", requirementId: id, route: `/auction/${id}` };
  }

  // 6. Seeded payment UUID prefix (d000...) vs requirement UUID
  if (UUID_REGEX.test(trimmed)) {
    if (trimmed.toLowerCase().startsWith("d000")) {
      return { kind: "receipt", reference: trimmed };
    }
    return { kind: "auction", requirementId: trimmed, route: `/auction/${trimmed}` };
  }

  return { kind: "unknown", raw: trimmed };
}

export function QrScannerModal({
  open,
  onOpenChange,
  defaultFocus = "auto",
}: QrScannerModalProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<"camera" | "upload" | "manual">("camera");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [scannedRaw, setScannedRaw] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [auctionResult, setAuctionResult] = useState<{
    info: AuctionSessionInfo;
    route: string;
  } | null>(null);
  const [receiptResult, setReceiptResult] = useState<{
    receipt: VerifiedReceipt;
    upiPayee?: string;
    upiAmount?: string;
  } | null>(null);

  const resetScanState = useCallback(() => {
    setScannedRaw(null);
    setResolveError(null);
    setAuctionResult(null);
    setReceiptResult(null);
    setCameraError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetScanState();
      setManualInput("");
      setActiveTab("camera");
    }
  }, [open, resetScanState]);

  const resolveQrValue = useCallback(
    async (rawValue: string) => {
      const cleaned = rawValue.trim();
      if (!cleaned) return;

      setScannedRaw(cleaned);
      setResolving(true);
      setResolveError(null);
      setAuctionResult(null);
      setReceiptResult(null);

      const target = parseQrPayload(cleaned);

      try {
        if (target.kind === "receipt") {
          const res = await fetch(
            `/api/payments/verify-receipt?ref=${encodeURIComponent(target.reference)}`
          );
          if (res.ok) {
            const data = (await res.json()) as { verified: boolean; receipt?: VerifiedReceipt };
            if (data.verified && data.receipt) {
              setReceiptResult({
                receipt: data.receipt,
                upiAmount: target.upiAmount,
                upiPayee: target.upiPayee,
              });
              toast({
                title: "Payment receipt verified",
                description: `Escrow status: ${data.receipt.escrowStatus.replace("_", " ")}`,
              });
              return;
            }
          }
          setResolveError(
            target.upiPayee
              ? `UPI QR detected for ${target.upiPayee}${target.upiAmount ? ` (₹${target.upiAmount})` : ""}, but no matching settled OmniBid receipt was found for ref "${target.reference}".`
              : `No verified OmniBid payment receipt found matching "${target.reference}".`
          );
          return;
        }

        if (target.kind === "auction") {
          const res = await fetch(`/api/requirements/${encodeURIComponent(target.requirementId)}`);
          if (res.ok) {
            const reqData = (await res.json()) as AuctionSessionInfo;
            setAuctionResult({ info: reqData, route: target.route });
            toast({
              title: "Auction session found",
              description: reqData.title,
            });
            return;
          }
          // Fallback: check if UUID happens to be a payment record
          const receiptRes = await fetch(
            `/api/payments/verify-receipt?ref=${encodeURIComponent(target.requirementId)}`
          );
          if (receiptRes.ok) {
            const data = (await receiptRes.json()) as { verified: boolean; receipt?: VerifiedReceipt };
            if (data.verified && data.receipt) {
              setReceiptResult({ receipt: data.receipt });
              return;
            }
          }
          setResolveError(`Auction session "${target.requirementId}" could not be found.`);
          return;
        }

        // Unknown format: try receipt verification as a last resort
        const fallbackRes = await fetch(
          `/api/payments/verify-receipt?ref=${encodeURIComponent(cleaned)}`
        );
        if (fallbackRes.ok) {
          const data = (await fallbackRes.json()) as { verified: boolean; receipt?: VerifiedReceipt };
          if (data.verified && data.receipt) {
            setReceiptResult({ receipt: data.receipt });
            return;
          }
        }
        setResolveError(
          "Unrecognized QR format. Scan an OmniBid auction QR, requirement link, or payment receipt code."
        );
      } catch {
        setResolveError("Unable to verify the scanned code. Please check your connection and try again.");
      } finally {
        setResolving(false);
      }
    },
    [toast]
  );

  const handleCameraScan = useCallback(
    (detectedCodes: IDetectedBarcode[]) => {
      if (resolving || auctionResult || receiptResult) return;
      const firstValid = detectedCodes.find((c) => Boolean(c.rawValue?.trim()));
      if (firstValid?.rawValue) {
        void resolveQrValue(firstValid.rawValue);
      }
    },
    [resolving, auctionResult, receiptResult, resolveQrValue]
  );

  const handleCameraError = useCallback((error: IScannerError) => {
    if (error.kind === "permission-denied") {
      setCameraError(
        "Camera permission was denied. Allow camera access or use Upload QR Image / Enter Code."
      );
    } else if (error.kind === "no-camera") {
      setCameraError(
        "No camera detected on this device. Use Upload QR Image or Enter Code instead."
      );
    } else {
      setCameraError(
        error.message || "Camera scanner unavailable. Try Upload QR Image or Enter Code."
      );
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Could not load image file"));
        img.src = objectUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(imageData.data, imageData.width, imageData.height);

      if (!decoded?.data) {
        setScannedRaw(file.name);
        setResolveError("No QR code found in the uploaded image. Try a sharper crop or enter the code manually.");
        return;
      }

      await resolveQrValue(decoded.data);
    } catch {
      setResolveError("Unable to read QR code from this image file.");
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    void resolveQrValue(manualInput.trim());
  };

  const navigateAndClose = (path: string) => {
    onOpenChange(false);
    setLocation(path);
  };

  const hasResult = Boolean(auctionResult || receiptResult || resolveError);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-qr-scanner">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            QR Code Scanner
          </DialogTitle>
          <DialogDescription>
            {defaultFocus === "receipt"
              ? "Scan a payment or UPI receipt QR to verify escrow settlement status."
              : "Scan an OmniBid QR code to join a live auction session or verify an escrow payment receipt."}
          </DialogDescription>
        </DialogHeader>

        {!hasResult && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "camera" | "upload" | "manual")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="camera" className="text-xs gap-1.5" data-testid="tab-qr-camera">
                <Camera className="h-3.5 w-3.5" />
                Camera
              </TabsTrigger>
              <TabsTrigger value="upload" className="text-xs gap-1.5" data-testid="tab-qr-upload">
                <ImageUp className="h-3.5 w-3.5" />
                Upload QR
              </TabsTrigger>
              <TabsTrigger value="manual" className="text-xs gap-1.5" data-testid="tab-qr-manual">
                <Keyboard className="h-3.5 w-3.5" />
                Enter Code
              </TabsTrigger>
            </TabsList>

            <TabsContent value="camera" className="mt-3 space-y-3">
              {cameraError ? (
                <div
                  className="rounded-xl border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-xs space-y-2.5"
                  data-testid="qr-camera-error"
                >
                  <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300 font-medium">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTab("upload")}
                    >
                      <ImageUp className="h-3.5 w-3.5 mr-1.5" />
                      Upload QR Image
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTab("manual")}
                    >
                      <Keyboard className="h-3.5 w-3.5 mr-1.5" />
                      Enter Code
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-muted/40 aspect-square max-h-72 mx-auto w-full relative">
                  <Scanner
                    onScan={handleCameraScan}
                    onError={handleCameraError}
                    formats={["qr_code"]}
                    constraints={{ facingMode: "environment" }}
                    paused={!open || activeTab !== "camera" || resolving || hasResult}
                    components={{ finder: true }}
                    styles={{
                      container: { width: "100%", height: "100%" },
                      video: { width: "100%", height: "100%", objectFit: "cover" },
                    }}
                  />
                </div>
              )}
              <p className="text-[11px] text-center text-muted-foreground">
                Point your camera at an auction invite QR or escrow payment receipt QR.
              </p>
            </TabsContent>

            <TabsContent value="upload" className="mt-3 space-y-3">
              <label
                htmlFor="qr-image-upload"
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 p-8 cursor-pointer transition-colors text-center"
              >
                <ImageUp className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  Upload a QR code image (PNG, JPG)
                </span>
                <span className="text-xs text-muted-foreground">
                  Decodes QR receipts and auction links locally using jsQR
                </span>
                <input
                  ref={fileInputRef}
                  id="qr-image-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileUpload}
                  data-testid="input-qr-file"
                />
              </label>
            </TabsContent>

            <TabsContent value="manual" className="mt-3">
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="qr-manual-input" className="text-xs">
                    Auction URL, Requirement ID, or Payment Receipt Reference
                  </Label>
                  <Input
                    id="qr-manual-input"
                    placeholder="e.g. /auction/a0000000-... or pay_mock_completed_01"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    data-testid="input-qr-manual"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!manualInput.trim() || resolving}
                  data-testid="button-verify-manual-qr"
                >
                  {resolving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <QrCode className="h-4 w-4 mr-1.5" />
                  )}
                  Verify &amp; Resolve
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}

        {resolving && (
          <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Verifying scanned QR payload...
          </div>
        )}

        {/* Resolved Auction Session */}
        {auctionResult && (
          <div
            className="rounded-xl border border-primary/30 bg-card p-4 space-y-3"
            data-testid="qr-result-auction"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Gavel className="h-4 w-4" />
                Auction Session Detected
              </div>
              <Badge variant="secondary" className="text-xs capitalize">
                {auctionResult.info.status.replace("_", " ")}
              </Badge>
            </div>

            <div>
              <h3 className="font-semibold text-sm text-foreground">{auctionResult.info.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {auctionResult.info.categoryName} · {auctionResult.info.city}, {auctionResult.info.state}
              </p>
            </div>

            <div className="flex items-center justify-between text-xs border-t border-border pt-2.5 tabular-nums">
              <span className="text-muted-foreground">
                Max Budget:{" "}
                <strong className="text-foreground">
                  ₹{Number(auctionResult.info.maxBudget).toLocaleString("en-IN")}
                </strong>
              </span>
              <span className="text-muted-foreground">
                Bids: <strong className="text-foreground">{auctionResult.info.bidCount}</strong>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button
                className="flex-1"
                onClick={() => navigateAndClose(`/auction/${auctionResult.info.id}`)}
                data-testid="button-join-scanned-auction"
              >
                Join Auction Session
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
              <Button
                variant="outline"
                onClick={() => navigateAndClose(`/requirements/${auctionResult.info.id}`)}
                data-testid="button-view-scanned-requirement"
              >
                View Details
              </Button>
            </div>
          </div>
        )}

        {/* Verified Payment Receipt */}
        {receiptResult && (
          <div
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/20 p-4 space-y-3"
            data-testid="qr-result-receipt"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                Verified Escrow Payment Receipt
              </div>
              <Badge className="bg-emerald-600 text-white text-xs capitalize">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {receiptResult.receipt.escrowStatus.replace("_", " ")}
              </Badge>
            </div>

            <div>
              <h3 className="font-semibold text-sm text-foreground">
                {receiptResult.receipt.requirementTitle}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {receiptResult.receipt.buyerName} → {receiptResult.receipt.providerName}
              </p>
            </div>

            <div className="border-t border-border/70 pt-2.5 space-y-1.5 text-xs tabular-nums">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross Escrow Value</span>
                <span className="font-semibold text-foreground inline-flex items-center">
                  <IndianRupee className="h-3 w-3" />
                  {receiptResult.receipt.totalAmount.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform Escrow Fee (2%)</span>
                <span>₹{receiptResult.receipt.platformFeeAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Section 194C TDS</span>
                <span>₹{receiptResult.receipt.tdsAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-400 border-t border-border/60 pt-1.5">
                <span>Net Provider Payout</span>
                <span>₹{receiptResult.receipt.netToProvider.toLocaleString("en-IN")}</span>
              </div>
              {receiptResult.receipt.upiTransactionId && (
                <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
                  <span>Transaction Ref</span>
                  <span className="font-mono">{receiptResult.receipt.upiTransactionId}</span>
                </div>
              )}
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Milestones Verified</span>
                <span>
                  {receiptResult.receipt.milestonesCompleted}/{receiptResult.receipt.totalMilestones}
                </span>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => navigateAndClose(`/payment/${receiptResult.receipt.requirementId}`)}
              data-testid="button-open-verified-payment"
            >
              <Receipt className="h-4 w-4 mr-1.5" />
              Open Payment &amp; Work Proofs
            </Button>
          </div>
        )}

        {/* Error / Unmatched State */}
        {resolveError && (
          <div
            className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-2 text-xs"
            data-testid="qr-result-error"
          >
            <div className="flex items-start gap-2 font-semibold text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{resolveError}</span>
            </div>
            {scannedRaw && (
              <p className="text-[11px] text-muted-foreground font-mono break-all">
                Scanned payload: {scannedRaw}
              </p>
            )}
          </div>
        )}

        {hasResult && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetScanState}
              data-testid="button-scan-another"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Scan Another QR
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
