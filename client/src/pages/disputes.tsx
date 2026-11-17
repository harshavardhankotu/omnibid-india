import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListDisputes,
  useRespondToDispute,
  useResolveDispute,
  getListDisputesQueryKey,
  type Dispute,
} from "@omnibid/api-client-react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gavel,
  MessageSquare,
  Scale,
  ShieldAlert,
} from "lucide-react";

function statusBadge(status: Dispute["status"]) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "Open", cls: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800" },
    provider_responded: { label: "Response received", cls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800" },
    resolved: { label: "Resolved", cls: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800" },
    cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={`text-xs capitalize ${s.cls}`}>{s.label}</Badge>;
}

function resolutionBadge(resolution: Dispute["resolution"]) {
  if (!resolution) return null;
  const map: Record<string, string> = {
    buyer_wins: "Buyer wins",
    provider_wins: "Provider wins",
    mutual: "Mutual agreement",
  };
  return <Badge className="text-xs bg-green-600 text-white">{map[resolution] ?? resolution}</Badge>;
}

export default function Disputes() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: disputes, isLoading } = useListDisputes({
    query: { queryKey: getListDisputesQueryKey(), enabled: !!user },
  });

  const respondMutation = useRespondToDispute();
  const resolveMutation = useResolveDispute();

  const [respondDialog, setRespondDialog] = useState<Dispute | null>(null);
  const [resolveDialog, setResolveDialog] = useState<Dispute | null>(null);
  const [responseText, setResponseText] = useState("");
  const [resolution, setResolution] = useState<"buyer_wins" | "provider_wins" | "mutual">("mutual");
  const [resolutionNote, setResolutionNote] = useState("");

  if (!user) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">
          <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Please login to view disputes</p>
          <Button className="mt-4" onClick={() => setLocation("/login")}>Login</Button>
        </div>
      </Layout>
    );
  }

  const handleRespond = () => {
    if (!respondDialog) return;
    respondMutation.mutate(
      { id: respondDialog.id, data: { response: responseText } },
      {
        onSuccess: () => {
          toast({ title: "Response submitted", description: "The other party has been notified." });
          qc.invalidateQueries({ queryKey: getListDisputesQueryKey() });
          setRespondDialog(null);
          setResponseText("");
        },
        onError: () => toast({ title: "Error", description: "Failed to submit response", variant: "destructive" }),
      }
    );
  };

  const handleResolve = () => {
    if (!resolveDialog || !resolutionNote.trim()) return;
    resolveMutation.mutate(
      { id: resolveDialog.id, data: { resolution, resolutionNote } },
      {
        onSuccess: () => {
          toast({ title: "Dispute resolved", description: "Both parties have been notified." });
          qc.invalidateQueries({ queryKey: getListDisputesQueryKey() });
          setResolveDialog(null);
          setResolutionNote("");
        },
        onError: () => toast({ title: "Error", description: "Failed to resolve dispute", variant: "destructive" }),
      }
    );
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Disputes
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              3-step resolution: raise → respond → resolve within 7 days
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        )}

        {!isLoading && (!disputes || disputes.length === 0) && (
          <div className="text-center py-16 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No disputes</p>
            <p className="text-sm mt-1">All your transactions are clean!</p>
          </div>
        )}

        <div className="space-y-3">
          {disputes?.map((dispute) => {
            const isRaisedByMe = dispute.raisedById === user.id;
            const isRespondent = dispute.respondentId === user.id;
            const canRespond = isRespondent && dispute.status === "open";
            const canResolve = (isRaisedByMe || isRespondent) && dispute.status === "provider_responded";

            return (
              <Card key={dispute.id} className="border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {statusBadge(dispute.status)}
                        {dispute.resolution && resolutionBadge(dispute.resolution)}
                        <Badge variant="outline" className="text-xs">
                          {isRaisedByMe ? "You raised" : "Raised against you"}
                        </Badge>
                      </div>
                      <CardTitle className="text-base">{dispute.title}</CardTitle>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {new Date(dispute.createdAt).toLocaleDateString("en-IN")}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3 inline mr-1" />
                    For requirement:{" "}
                    <button
                      onClick={() => setLocation(`/requirements/${dispute.requirementId}`)}
                      className="text-primary hover:underline font-medium"
                    >
                      {dispute.requirementTitle}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{dispute.raisedByName} → {dispute.respondentName}</span>
                  </div>

                  <p className="text-sm text-foreground/80 bg-muted/50 rounded-lg p-3">{dispute.description}</p>

                  {dispute.response && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 mb-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Response from {dispute.respondentName}
                      </div>
                      <p className="text-sm text-foreground/80 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-lg p-3">{dispute.response}</p>
                    </div>
                  )}

                  {dispute.status === "resolved" && dispute.resolutionNote && (
                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-3">
                      <div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Resolution note
                      </div>
                      <p className="text-sm text-foreground/80">{dispute.resolutionNote}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    {canRespond && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRespondDialog(dispute)}
                        data-testid={`button-respond-${dispute.id}`}
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                        Submit Response
                      </Button>
                    )}
                    {canResolve && (
                      <Button
                        size="sm"
                        onClick={() => setResolveDialog(dispute)}
                        data-testid={`button-resolve-${dispute.id}`}
                      >
                        <Gavel className="h-3.5 w-3.5 mr-1.5" />
                        Resolve Dispute
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Respond Dialog */}
        <Dialog open={!!respondDialog} onOpenChange={(o) => !o && setRespondDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Your Response</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Dispute: {respondDialog?.title}</Label>
                <p className="text-xs text-muted-foreground mt-1">{respondDialog?.description}</p>
              </div>
              <div>
                <Label htmlFor="response-text" className="text-sm">Your response</Label>
                <Textarea
                  id="response-text"
                  placeholder="Explain your side clearly with evidence..."
                  rows={5}
                  className="mt-1.5"
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRespondDialog(null)}>Cancel</Button>
              <Button onClick={handleRespond} disabled={responseText.length < 10 || respondMutation.isPending}>
                Submit Response
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Resolve Dialog */}
        <Dialog open={!!resolveDialog} onOpenChange={(o) => !o && setResolveDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Resolve Dispute
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Both parties agree to close this dispute. Select the resolution outcome.
              </p>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Resolution outcome</Label>
                <Select value={resolution} onValueChange={(v) => setResolution(v as typeof resolution)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mutual">Mutual agreement — both parties settled</SelectItem>
                    <SelectItem value="buyer_wins">Buyer wins — service not delivered</SelectItem>
                    <SelectItem value="provider_wins">Provider wins — work was completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="resolution-note" className="text-sm">Resolution note</Label>
                <Textarea
                  id="resolution-note"
                  placeholder="Briefly describe how this was resolved..."
                  rows={3}
                  className="mt-1.5"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveDialog(null)}>Cancel</Button>
              <Button onClick={handleResolve} disabled={resolutionNote.length < 5 || resolveMutation.isPending}>
                Confirm Resolution
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
