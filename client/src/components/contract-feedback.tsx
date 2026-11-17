import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCreateReview,
  getGetRequirementQueryKey,
  getGetUserQueryKey,
  getGetUserReviewsQueryKey,
  type Review,
} from "@omnibid/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useOnlineStatus } from "@/hooks/use-pwa";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, ExternalLink, Loader2, MessageSquarePlus, Star } from "lucide-react";

const RATING_LABELS: Record<number, string> = {
  1: "Poor — Major issues",
  2: "Fair — Below expectations",
  3: "Good — Met expectations",
  4: "Very Good — Smooth delivery",
  5: "Excellent — Outstanding work",
};

interface ContractFeedbackProps {
  requirementId: string;
  requirementTitle?: string;
  providerId: string;
  providerName: string;
  contractStatus: string;
  isBuyer: boolean;
}

type ContractReviewResponse = {
  review: (Review & { requirementTitle?: string | null }) | null;
};

export function ContractFeedback({
  requirementId,
  requirementTitle,
  providerId,
  providerName,
  contractStatus,
  isBuyer,
}: ContractFeedbackProps) {
  const isOnline = useOnlineStatus();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createReview = useCreateReview();

  const [rating, setRating] = useState<number>(5);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [localSubmittedReview, setLocalSubmittedReview] = useState<Review | null>(null);

  const isCompleted = contractStatus === "completed";

  const { data: reviewData, isLoading: isCheckingReview } = useQuery<ContractReviewResponse>({
    queryKey: [`/api/requirements/${requirementId}/review`],
    queryFn: async () => {
      const token = localStorage.getItem("omnibid_token");
      const res = await fetch(`/api/requirements/${requirementId}/review`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Failed to check contract feedback");
      return res.json();
    },
    enabled: !!requirementId && isCompleted,
  });

  if (!isCompleted) return null;

  const existingReview = localSubmittedReview ?? reviewData?.review ?? null;
  const activeStars = hoveredRating ?? rating;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || !isBuyer || createReview.isPending) return;

    createReview.mutate(
      {
        data: {
          requirementId,
          revieweeId: providerId,
          rating,
          comment: comment.trim() || undefined,
        },
      },
      {
        onSuccess: (created) => {
          setLocalSubmittedReview(created);
          queryClient.invalidateQueries({ queryKey: [`/api/requirements/${requirementId}/review`] });
          queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(providerId) });
          queryClient.invalidateQueries({ queryKey: getGetUserReviewsQueryKey(providerId) });
          queryClient.invalidateQueries({ queryKey: getGetRequirementQueryKey(requirementId) });
          toast({
            title: "Feedback Submitted",
            description: `Your ${rating}-star review for ${providerName} has been recorded.`,
          });
        },
        onError: (err: unknown) => {
          const message =
            (err as { data?: { error?: string }; message?: string })?.data?.error ??
            (err as Error)?.message ??
            "Could not submit feedback. Please try again.";
          toast({
            title: "Submission Failed",
            description: message,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Card className="border-amber-500/30 bg-card shadow-xs" data-testid="card-contract-feedback">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
              Completed Contract Feedback
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {requirementTitle
                ? `Feedback for ${providerName} on "${requirementTitle}"`
                : `Share your experience working with ${providerName}`}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[11px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
            Contract Completed
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {isCheckingReview && !existingReview ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking feedback status...
          </div>
        ) : existingReview ? (
          <div
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2.5"
            data-testid="submitted-contract-feedback"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-foreground">
                  {isBuyer ? "Your Feedback" : `Buyer Feedback by ${existingReview.reviewerName}`}
                </span>
              </div>
              <div className="flex items-center gap-1" aria-label={`Rated ${existingReview.rating} out of 5 stars`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i < existingReview.rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/40"
                    }`}
                  />
                ))}
                <span className="text-xs font-semibold ml-1 text-foreground">
                  {existingReview.rating}.0 / 5
                </span>
              </div>
            </div>

            {existingReview.comment ? (
              <p className="text-sm text-foreground/85 leading-relaxed">{existingReview.comment}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">No written comment added.</p>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-border/60 text-xs text-muted-foreground flex-wrap gap-2">
              <span>
                Submitted on {new Date(existingReview.createdAt).toLocaleDateString("en-IN")}
              </span>
              <Link
                href={`/profile/${providerId}`}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                data-testid="link-provider-profile-rating"
              >
                View {providerName}&apos;s ratings
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ) : isBuyer ? (
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-contract-feedback">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Rate Provider Performance
                </Label>
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400" data-testid="text-rating-label">
                  {RATING_LABELS[activeStars]}
                </span>
              </div>

              <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Provider star rating">
                {[1, 2, 3, 4, 5].map((value) => {
                  const active = value <= activeStars;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      aria-label={`Rate ${value} ${value === 1 ? "star" : "stars"}`}
                      onClick={() => setRating(value)}
                      onMouseEnter={() => setHoveredRating(value)}
                      onMouseLeave={() => setHoveredRating(null)}
                      disabled={createReview.isPending}
                      className="p-1.5 rounded-lg border border-transparent hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-transform hover:scale-105"
                      data-testid={`button-star-${value}`}
                    >
                      <Star
                        className={`h-6 w-6 transition-colors ${
                          active
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/40 hover:text-amber-300"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`feedback-comment-${requirementId}`} className="text-xs font-medium">
                Comment (optional)
              </Label>
              <Textarea
                id={`feedback-comment-${requirementId}`}
                rows={3}
                maxLength={800}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={createReview.isPending || !isOnline}
                placeholder={`How did ${providerName} perform on quality, timeliness, and communication?`}
                data-testid="textarea-feedback-comment"
              />
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Link
                href={`/profile/${providerId}`}
                className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
              >
                View {providerName}&apos;s profile
                <ExternalLink className="h-3 w-3" />
              </Link>

              <Button
                type="submit"
                disabled={!isOnline || createReview.isPending}
                data-testid="button-submit-feedback"
              >
                {createReview.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Submitting...
                  </>
                ) : !isOnline ? (
                  "Reconnect to Submit Feedback"
                ) : (
                  <>
                    <MessageSquarePlus className="h-4 w-4 mr-1.5" />
                    Submit Feedback
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground flex items-center justify-between gap-2 flex-wrap">
            <span>Awaiting buyer rating &amp; review for this completed contract.</span>
            <Link
              href={`/profile/${providerId}`}
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              View Profile Ratings
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
