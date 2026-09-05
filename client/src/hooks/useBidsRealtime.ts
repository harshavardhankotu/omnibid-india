import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export interface RealtimeBidPayload {
  id: string;
  requirement_id: string;
  provider_id: string;
  proposal_text: string;
  bid_amount: string;
  milestone_count: number;
  status: string;
  created_at: string;
}

/**
 * Custom hook to listen to Supabase Postgres CDC events on the `bids` table
 * filtered by the current active requirementId.
 */
export function useBidsRealtime(requirementId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [lastLiveBid, setLastLiveBid] = useState<RealtimeBidPayload | null>(null);

  useEffect(() => {
    if (!requirementId) return;

    // Set up Supabase Realtime channel
    const channel = supabase
      .channel(`live-bids-${requirementId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bids",
          filter: `requirement_id=eq.${requirementId}`,
        },
        (payload) => {
          const newBid = payload.new as RealtimeBidPayload;
          setLastLiveBid(newBid);

          // Invalidate React Query cache to re-fetch bids dynamically
          queryClient.invalidateQueries({ queryKey: [`/api/requirements/${requirementId}`] });
          queryClient.invalidateQueries({ queryKey: [`/api/requirements/${requirementId}/bids`] });

          toast({
            title: "⚡ New Realtime Bid Placed!",
            description: `A contractor submitted a bid of ₹${parseFloat(newBid.bid_amount || "0").toLocaleString("en-IN")}.`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requirementId, queryClient, toast]);

  return { lastLiveBid };
}
