import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Gift, Copy, CheckCheck, Send, Users, Trophy,
  IndianRupee, ArrowRight, Share2, MessageSquare,
} from "lucide-react";

const TOKEN_KEY = "omnibid_token";
function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

type ReferralItem = { id: string; refereeEmail: string | null; status: string; rewardAmount: number; createdAt: string; convertedAt: string | null };
type ReferralStats = { referralCode: string; referralLink: string; totalReferrals: number; convertedReferrals: number; totalRewardEarned: number; pendingReward: number; referrals: ReferralItem[] };

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Invited", cls: "bg-muted text-muted-foreground" },
  clicked: { label: "Link Clicked", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  signed_up: { label: "Signed Up", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300" },
  converted: { label: "First Bid!", cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  rewarded: { label: "Reward Paid", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
};

export default function Referral() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: stats, isLoading } = useQuery<ReferralStats>({
    queryKey: ["/referrals/my"],
    queryFn: async () => {
      const res = await authFetch("/referrals/my");
      if (!res.ok) throw new Error("Failed to load referrals");
      return res.json();
    },
    enabled: !!user,
  });

  const invite = useMutation({
    mutationFn: async (emailAddr: string) => {
      const res = await authFetch("/referrals/invite", {
        method: "POST",
        body: JSON.stringify({ email: emailAddr }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Failed to send invite");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite sent!", description: `Referral invite sent to ${email}` });
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["/referrals/my"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send invite", description: err.message, variant: "destructive" });
    },
  });

  function handleCopy() {
    if (!stats?.referralLink) return;
    navigator.clipboard.writeText(stats.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied!" });
  }

  function handleShare() {
    if (!stats) return;
    const text = `Join OmniBid India — India's reverse-auction marketplace! Use my referral code ${stats.referralCode} to get started. ${stats.referralLink}`;
    if (navigator.share) {
      navigator.share({ title: "Join OmniBid India", text, url: stats.referralLink });
    } else {
      navigator.clipboard.writeText(text);
      toast({ title: "Share text copied to clipboard!" });
    }
  }

  function handleWhatsApp() {
    if (!stats) return;
    const text = encodeURIComponent(`Join OmniBid India — get competitive quotes from verified providers! Use my referral: ${stats.referralLink}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  if (!user) {
    return (
      <Layout>
        <div className="text-center py-16 text-muted-foreground">Please log in to access the referral programme.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 mb-3">
            <Gift className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Refer & Earn</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Earn <strong>₹200 per referral</strong> when your friend posts their first requirement or submits their first bid
          </p>
        </div>

        {/* Stats row */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[0,1,2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-3 gap-4">
            <Card className="text-center">
              <CardContent className="pt-4 pb-4">
                <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-2xl font-bold">{stats.totalReferrals}</p>
                <p className="text-xs text-muted-foreground">Total Invited</p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4 pb-4">
                <Trophy className="h-5 w-5 mx-auto text-yellow-500 mb-1" />
                <p className="text-2xl font-bold text-yellow-600">{stats.convertedReferrals}</p>
                <p className="text-xs text-muted-foreground">Converted</p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4 pb-4">
                <IndianRupee className="h-5 w-5 mx-auto text-green-500 mb-1" />
                <p className="text-2xl font-bold text-green-600">₹{stats.totalRewardEarned}</p>
                <p className="text-xs text-muted-foreground">Earned</p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Referral link card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Referral Link</CardTitle>
            <CardDescription>Share this link to earn rewards when friends join</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? <Skeleton className="h-10 w-full" /> : (
              <>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input value={stats?.referralLink ?? ""} readOnly className="pr-4 text-sm font-mono bg-muted" />
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={handleCopy}>
                    {copied ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Your code:</span>
                  <code className="bg-muted px-2 py-0.5 rounded font-mono font-bold">{stats?.referralCode}</code>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleShare}>
                    <Share2 className="h-3.5 w-3.5 mr-1.5" />
                    Share
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-green-700 border-green-200 hover:bg-green-50" onClick={handleWhatsApp}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                    WhatsApp
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Email invite */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invite by Email</CardTitle>
            <CardDescription>Send a personalised invite to a colleague or friend</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="sr-only">Email address</Label>
                <Input
                  type="email"
                  placeholder="friend@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && email) invite.mutate(email); }}
                />
              </div>
              <Button size="sm" disabled={!email || invite.isPending} onClick={() => invite.mutate(email)}>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {invite.isPending ? "Sending…" : "Invite"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* How it works */}
        <Card className="bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { step: "1", text: "Share your unique referral link or invite by email" },
                { step: "2", text: "Your friend signs up using your link" },
                { step: "3", text: "They post a requirement (buyers) or submit a bid (providers)" },
                { step: "4", text: "You earn ₹200 credited to your OmniBid wallet" },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{step}</div>
                  <p className="text-sm">{text}</p>
                </div>
              ))}
            </div>
            <Separator className="my-4" />
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-lg font-bold text-primary">₹200</p>
                <p className="text-xs text-muted-foreground">Buyer referral reward</p>
              </div>
              <div>
                <p className="text-lg font-bold text-primary">₹200</p>
                <p className="text-xs text-muted-foreground">Provider referral reward</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Referral history */}
        {stats && stats.referrals.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your Referrals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.referrals.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{r.refereeEmail ?? "Anonymous"}</p>
                      <p className="text-xs text-muted-foreground">Invited {new Date(r.createdAt).toLocaleDateString("en-IN")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.rewardAmount > 0 && (
                        <span className="text-xs text-green-600 font-semibold">+₹{r.rewardAmount}</span>
                      )}
                      <Badge className={`text-xs ${STATUS_BADGE[r.status]?.cls ?? ""}`}>
                        {STATUS_BADGE[r.status]?.label ?? r.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending reward */}
        {stats && stats.pendingReward > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-yellow-800">₹{stats.pendingReward} pending reward</p>
                <p className="text-xs text-yellow-700 mt-0.5">Will be credited once your referrals complete their first transaction</p>
              </div>
              <ArrowRight className="h-5 w-5 text-yellow-500" />
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
