import os
import sys
import json
import urllib.parse
import urllib.request
from typing import Dict, Any, Optional

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

class MultiChannelDistributor:
    """
    Autonomous Affiliate Deal Broadcaster.
    Formats and dispatches high-CTR campaign assets across Telegram, WhatsApp, and Twitter/X
    with anti-bot tracking redirects and automated webhook delivery.
    """

    def __init__(self, base_redirect_url: str = "https://omnibid.in/go"):
        self.base_redirect_url = os.environ.get("OMNIBID_AFFILIATE_BASE_URL", base_redirect_url)
        self.telegram_bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self.telegram_chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")

    def format_campaign(self, campaign: Dict[str, Any]) -> Dict[str, str]:
        campaign_id = campaign.get("campaign_id", "deal_001")
        title = campaign.get("title", "High-Demand Commercial Inventory")
        deal_price = campaign.get("deal_price", "0")
        original_price = campaign.get("original_price", "0")
        tracking_link = f"{self.base_redirect_url}/{campaign_id}"

        # 1. Telegram Broadcast Format (Rich Markdown + Emojis)
        telegram_msg = (
            f"⚡ *EXCLUSIVE COMMERCIAL DEAL DETECTED*\n\n"
            f"📦 *Item*: {title}\n"
            f"💰 *Deal Price*: Rs. {deal_price} ~~(MRP: Rs. {original_price})~~\n"
            f"🛡️ *Trust*: 100% Escrow Protected by OmniBid India\n\n"
            f"👉 [CLAIM DEAL BEFORE EXCLUSION]({tracking_link})"
        )

        # 2. WhatsApp Community Format (Bold emphasis + Clean URLs)
        whatsapp_msg = (
            f"*🔥 FLASH MARKETPLACE OPPORTUNITY*\n\n"
            f"*{title}*\n"
            f"• Slashed Price: *Rs. {deal_price}* (Standard: Rs. {original_price})\n"
            f"• Verified Provider with KYC Trust Vault\n\n"
            f"Tap to secure through Escrow:\n"
            f"{tracking_link}"
        )

        # 3. Twitter / X Format (Optimized under 280 characters with hashtags)
        short_title = title[:120]
        twitter_msg = (
            f"🚨 Commercial Deal Alert!\n\n"
            f"{short_title}\n"
            f"Rs. {deal_price} (MRP: Rs. {original_price})\n\n"
            f"Claim verified deal:\n{tracking_link}\n\n"
            f"#B2B #Procurement #IndiaBusiness #OmniBid"
        )

        return {
            "telegram": telegram_msg,
            "whatsapp": whatsapp_msg,
            "twitter": twitter_msg,
            "tracking_url": tracking_link,
        }

    def broadcast_telegram(self, message: str) -> Dict[str, Any]:
        """
        Dispatches message to Telegram Channel via Telegram Bot API or logs in mock mode.
        """
        if not self.telegram_bot_token or not self.telegram_chat_id:
            # Mock mode for testing/local
            return {
                "status": "mock_sent",
                "channel": "telegram",
                "length": len(message),
                "preview": message[:80] + "...",
            }

        url = f"https://api.telegram.org/bot{self.telegram_bot_token}/sendMessage"
        payload = {
            "chat_id": self.telegram_chat_id,
            "text": message,
            "parse_mode": "Markdown",
            "disable_web_page_preview": False,
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                res_body = response.read().decode("utf-8")
                return {"status": "delivered", "response": json.loads(res_body)}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

if __name__ == "__main__":
    distributor = MultiChannelDistributor()
    sample_deal = {
        "campaign_id": "cmp_steel_infra_881",
        "title": "Industrial Warehouse Steel Beams & Framework",
        "deal_price": "12,00,000",
        "original_price": "15,00,000",
    }
    formats = distributor.format_campaign(sample_deal)
    print("--- Telegram Payload ---")
    print(formats["telegram"])
    res = distributor.broadcast_telegram(formats["telegram"])
    print("\nBroadcast Status:", res)
