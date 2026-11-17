export interface WebSharePayload {
  title: string;
  text: string;
  url: string;
}

export type WebShareResult =
  | { status: "shared" }
  | { status: "aborted" }
  | { status: "copied" }
  | { status: "fallback"; summary: string };

export async function shareWithWebShare(payload: WebSharePayload): Promise<WebShareResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return { status: "shared" };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { status: "aborted" };
      }
    }
  }

  const combinedText = `${payload.title}\n${payload.text}\n${payload.url}`;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(combinedText);
      return { status: "copied" };
    }
  } catch {
    // Fallback below if clipboard access is blocked
  }

  return { status: "fallback", summary: combinedText };
}
