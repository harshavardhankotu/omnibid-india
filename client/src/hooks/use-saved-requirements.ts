import { useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Requirement } from "@omnibid/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export interface SavedRequirementItem extends Requirement {
  savedAt: string;
}

interface SavedRequirementsResponse {
  requirements: SavedRequirementItem[];
  savedIds: string[];
}

export function useSavedRequirements() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const queryKey = ["saved-requirements", user?.id ?? "anon"];

  const { data, isLoading } = useQuery<SavedRequirementsResponse>({
    queryKey,
    queryFn: async () => {
      const token = localStorage.getItem("omnibid_token");
      const res = await fetch("/api/requirements/saved", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        throw new Error("Failed to load saved requirements");
      }
      return res.json();
    },
    enabled: !!user,
  });

  const savedRequirements = data?.requirements ?? [];
  const savedIds = useMemo(
    () => new Set<string>(data?.savedIds ?? savedRequirements.map((r) => r.id)),
    [data?.savedIds, savedRequirements]
  );

  const mutation = useMutation({
    mutationFn: async ({
      requirementId,
      shouldSave,
    }: {
      requirementId: string;
      shouldSave: boolean;
      requirementTitle?: string;
    }) => {
      const token = localStorage.getItem("omnibid_token");
      const res = await fetch(`/api/requirements/${requirementId}/bookmark`, {
        method: shouldSave ? "POST" : "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update saved requirement");
      }
      return res.json() as Promise<{ requirementId: string; saved: boolean; savedAt?: string }>;
    },
    onMutate: async ({ requirementId, shouldSave }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<SavedRequirementsResponse>(queryKey);
      if (previous) {
        const nextSavedIds = shouldSave
          ? Array.from(new Set([requirementId, ...previous.savedIds]))
          : previous.savedIds.filter((id) => id !== requirementId);
        const nextReqs = shouldSave
          ? previous.requirements
          : previous.requirements.filter((r) => r.id !== requirementId);
        qc.setQueryData<SavedRequirementsResponse>(queryKey, {
          requirements: nextReqs,
          savedIds: nextSavedIds,
        });
      }
      return { previous };
    },
    onSuccess: (_data, { shouldSave, requirementTitle }) => {
      toast({
        title: shouldSave ? "Saved for later" : "Removed from saved requirements",
        description: requirementTitle
          ? shouldSave
            ? `"${requirementTitle}" was added to your Profile's Saved Requirements.`
            : `"${requirementTitle}" was removed from your Saved Requirements.`
          : undefined,
      });
    },
    onError: (err: unknown, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKey, context.previous);
      }
      toast({
        title: "Bookmark update failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const toggleBookmark = (requirementId: string, requirementTitle?: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Login to bookmark requirements and view them on your profile.",
      });
      setLocation("/login");
      return;
    }

    const currentlySaved = savedIds.has(requirementId);
    mutation.mutate({
      requirementId,
      shouldSave: !currentlySaved,
      requirementTitle,
    });
  };

  return {
    savedRequirements,
    savedIds,
    isLoading,
    isPending: mutation.isPending,
    isSaved: (requirementId: string) => savedIds.has(requirementId),
    toggleBookmark,
  };
}
