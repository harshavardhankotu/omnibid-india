import re
import urllib.parse
from playwright.sync_api import sync_playwright

def trace_and_extract_url(initial_url: str, timeout_ms: int = 15000) -> dict:
    """
    Traces multi-hop affiliate redirect chains using Playwright headless browser
    and resolves the clean destination merchant URL.
    """
    visited_hops = []
    final_clean_url = initial_url

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        def on_response(response):
            if 300 <= response.status < 400:
                loc = response.headers.get("location", "")
                visited_hops.append({
                    "from_url": response.url,
                    "to_url": loc,
                    "status": response.status
                })

        page.on("response", on_response)

        try:
            page.goto(initial_url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_timeout(1000)
            final_clean_url = page.url

            # Strip tracking affiliate tags from Amazon / Flipkart destinations if desired
            parsed = urllib.parse.urlparse(final_clean_url)
            query_params = urllib.parse.parse_qs(parsed.query)

            # Strip ad-click clickids, keep primary product query
            for tracking_key in ["gclid", "fbclid", "utm_source", "utm_medium", "utm_campaign"]:
                query_params.pop(tracking_key, None)

            clean_query = urllib.parse.urlencode(query_params, doseq=True)
            final_clean_url = urllib.parse.urlunparse(parsed._replace(query=clean_query))

        except Exception as e:
            print(f"Playwright navigation warning: {e}")
        finally:
            browser.close()

    return {
        "original_url": initial_url,
        "resolved_url": final_clean_url,
        "hop_count": len(visited_hops),
        "hops": visited_hops
    }

if __name__ == "__main__":
    test_url = "https://www.amazon.in/dp/B0CHX1W1XY?tag=test-affil-21"
    print("Testing Playwright Multi-hop Resolver...")
    res = trace_and_extract_url(test_url)
    print(f"Resolved URL: {res['resolved_url']} (Hops: {res['hop_count']})")
