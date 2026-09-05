import os
from PIL import Image, ImageDraw, ImageFont

def generate_deal_banner(
    title: str,
    original_price: str,
    deal_price: str,
    discount_pct: str,
    cta_text: str = "GRAB DEAL NOW ➔",
    output_path: str = "banner_1200x630.png"
) -> str:
    """
    Generates a high-CTR promotional banner in standard 1200x630 resolution (OpenGraph/Twitter Card).
    """
    width, height = 1200, 630
    # Create dark modern gradient/solid background
    banner = Image.new("RGB", (width, height), color="#0F172A")
    draw = ImageDraw.Draw(banner)

    # Accent decorative border
    draw.rectangle([(20, 20), (width - 20, height - 20)], outline="#38BDF8", width=4)

    # Header Badge (e.g., "⚡ VERIFIED COMMERCIAL DEALS")
    draw.rounded_rectangle([(60, 50), (420, 95)], radius=10, fill="#0284C7")
    draw.text((80, 62), "⚡ VERIFIED COMMERCIAL DEAL", fill="#FFFFFF")

    # Discount Pill Badge
    draw.rounded_rectangle([(width - 280, 50), (width - 60, 110)], radius=12, fill="#DC2626")
    draw.text((width - 250, 65), f"{discount_pct} OFF", fill="#FFFFFF")

    # Title
    draw.text((60, 150), title[:45], fill="#F8FAFC")
    if len(title) > 45:
      draw.text((60, 200), title[45:90], fill="#CBD5E1")

    # Price Showcase Box
    draw.rounded_rectangle([(60, 280), (550, 420)], radius=15, fill="#1E293B", outline="#475569", width=2)
    draw.text((90, 310), "ORIGINAL PRICE:", fill="#94A3B8")
    draw.text((250, 310), f"Rs. {original_price}", fill="#EF4444")
    # Strikethrough line
    draw.line([(245, 318), (380, 318)], fill="#EF4444", width=3)

    draw.text((90, 350), "DEAL PRICE:", fill="#38BDF8")
    draw.text((250, 345), f"Rs. {deal_price}", fill="#22C55E")

    # CTA Button
    draw.rounded_rectangle([(60, 470), (460, 550)], radius=14, fill="#22C55E")
    draw.text((100, 495), cta_text, fill="#022C22")

    # Footer note
    draw.text((width - 450, 550), "Guaranteed Escrow Protection | OmniBid", fill="#64748B")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    banner.save(output_path, "PNG")
    return output_path

if __name__ == "__main__":
    out = generate_deal_banner(
        title="Industrial Pre-Engineered Structural Warehouse Steel Deal",
        original_price="15,00,000",
        deal_price="12,00,000",
        discount_pct="20%",
        output_path="test_banner.png"
    )
    print(f"Generated sample banner: {out}")
