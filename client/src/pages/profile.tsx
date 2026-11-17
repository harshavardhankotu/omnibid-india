import { useParams, Link } from "wouter";
import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetUser, useGetUserReviews, getGetUserQueryKey, getGetUserReviewsQueryKey } from "@omnibid/api-client-react";
import { useAuth } from "@/lib/auth";
import { SavedRequirementsSection } from "@/components/saved-requirements-section";
import { MapPin, Shield, Star, Trophy, UserCircle } from "lucide-react";

const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  free: { label: "Free", cls: "bg-gray-100 text-gray-700" },
  starter: { label: "Starter", cls: "bg-blue-100 text-blue-700" },
  pro: { label: "Pro", cls: "bg-purple-100 text-purple-700" },
};

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const { user: authUser } = useAuth();
  const isOwnProfile = !!authUser && authUser.id === id;

  const { data: user, isLoading } = useGetUser(id, {
    query: { queryKey: getGetUserQueryKey(id), enabled: !!id },
  });

  const { data: reviews, isLoading: reviewsLoading } = useGetUserReviews(id, {
    query: { queryKey: getGetUserReviewsQueryKey(id), enabled: !!id },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="text-center py-16 text-muted-foreground">User not found</div>
      </Layout>
    );
  }

  const plan = user.subscriptionPlan ? PLAN_BADGE[user.subscriptionPlan] : null;
  const reviewCount = user.reviewCount ?? reviews?.length ?? 0;
  const avgRating =
    user.avgRating != null
      ? Number(user.avgRating)
      : reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  const isProviderProfile =
    user.role === "provider" ||
    user.role === "both" ||
    user.role === "solo_provider" ||
    user.role === "agency_provider";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Profile Header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary flex-shrink-0">
                {user.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold">{user.name}</h1>
                  {user.isVerified && (
                    <Shield className="h-4 w-4 text-primary" aria-label="Verified" />
                  )}
                  {plan && (
                    <Badge className={`text-xs capitalize ${plan.cls}`}>{plan.label}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                  <span className="capitalize">{user.role.replace("_", " ")}</span>
                  {user.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {user.city}{user.state ? `, ${user.state}` : ""}
                    </span>
                  )}
                  <span>Joined {new Date(user.createdAt).getFullYear()}</span>
                </div>

                <div className="flex items-center gap-6 mt-4 flex-wrap">
                  <div className="text-center">
                    <div className="font-bold text-lg">{user.trustScore}</div>
                    <div className="text-xs text-muted-foreground">Trust Score</div>
                  </div>
                  {(isProviderProfile || avgRating !== null) && (
                    <div className="text-center" data-testid="provider-avg-rating">
                      <div className="font-bold text-lg flex items-center gap-1 justify-center">
                        <Star className={`h-4 w-4 ${avgRating !== null ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                        <span>{avgRating !== null ? avgRating.toFixed(1) : "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="provider-review-count">
                        {reviewCount > 0
                          ? `Avg Rating (${reviewCount} ${reviewCount === 1 ? "review" : "reviews"})`
                          : "No ratings yet"}
                      </div>
                    </div>
                  )}
                  {user.totalBidsWon > 0 && (
                    <div className="text-center">
                      <div className="font-bold text-lg flex items-center gap-1 justify-center">
                        <Trophy className="h-4 w-4 text-amber-500" />
                        {user.totalBidsWon}
                      </div>
                      <div className="text-xs text-muted-foreground">Jobs Won</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Saved Requirements (visible on own profile) */}
        {isOwnProfile && <SavedRequirementsSection />}

        {/* Reviews & Average Rating Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">Contract Feedback &amp; Reviews ({reviewCount})</CardTitle>
              {avgRating !== null && (
                <Badge variant="secondary" className="text-xs font-semibold gap-1">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {avgRating.toFixed(1)} / 5.0 Average
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {reviews && reviews.length > 0 && (
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-4 items-center">
                <div className="text-center sm:border-r sm:border-border/60 sm:pr-4">
                  <div className="text-3xl font-bold tracking-tight">{avgRating?.toFixed(1) ?? "—"}</div>
                  <div className="flex items-center justify-center gap-0.5 my-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${
                          avgRating !== null && i < Math.round(avgRating)
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{reviewCount} {reviewCount === 1 ? "review" : "reviews"}</p>
                </div>
                <div className="space-y-1.5">
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const countForStar = reviews.filter((r) => r.rating === stars).length;
                    const pct = reviews.length > 0 ? Math.round((countForStar / reviews.length) * 100) : 0;
                    return (
                      <div key={stars} className="flex items-center gap-2 text-xs">
                        <span className="w-8 text-muted-foreground font-medium">{stars}★</span>
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="w-6 text-right text-muted-foreground">{countForStar}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {reviewsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            ) : reviews?.length ? (
              <div className="space-y-3">
                {reviews.map((review) => {
                  const reqTitle = (review as typeof review & { requirementTitle?: string | null }).requirementTitle;
                  return (
                    <div key={review.id} className="p-3.5 rounded-lg border border-border space-y-1.5" data-testid={`card-review-${review.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{review.reviewerName}</span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3.5 w-3.5 ${i < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                            />
                          ))}
                        </div>
                      </div>
                      {reqTitle && (
                        <Link
                          href={`/requirements/${review.requirementId}`}
                          className="inline-block text-xs text-primary/90 hover:underline font-medium"
                        >
                          Contract: {reqTitle}
                        </Link>
                      )}
                      {review.comment && <p className="text-sm text-muted-foreground">{review.comment}</p>}
                      <p className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString("en-IN")}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <UserCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No reviews yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
