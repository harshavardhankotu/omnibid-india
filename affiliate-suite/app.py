import os
import sqlite3
import hmac
import hashlib
import time
import re
from datetime import datetime
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from flask import Flask, request, jsonify, redirect

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'affiliate_secret_production_key_1234')

# Persistent SQLite database resolution for Linux containers & Render disk mounts
DEFAULT_DB = "/var/data/affiliate.db" if os.environ.get("FLASK_ENV") == "production" or os.path.exists("/var/data") else os.path.join(os.path.dirname(__file__), 'marketing.db')
DB_PATH = os.environ.get('SQLITE_DB_PATH', DEFAULT_DB)

# Ensure directory assertion for WAL and journal files
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)

POSTBACK_SECRET = os.environ.get('POSTBACK_SECRET', 'default_secret_key_123')

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        deal_price REAL NOT NULL,
        original_price REAL NOT NULL,
        affiliate_url TEXT NOT NULL,
        sector TEXT DEFAULT 'general',
        status TEXT DEFAULT 'active',
        total_clicks INTEGER DEFAULT 0,
        total_conversions INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        is_bot INTEGER DEFAULT 0,
        clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS conversions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT UNIQUE NOT NULL,
        campaign_id TEXT NOT NULL,
        sale_amount REAL NOT NULL,
        commission_amount REAL NOT NULL,
        converted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS circuit_breaker_state (
        provider TEXT PRIMARY KEY,
        state TEXT DEFAULT 'CLOSED', -- CLOSED, OPEN, HALF_OPEN
        failure_count INTEGER DEFAULT 0,
        last_failure_at TIMESTAMP
    );
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS dead_letter_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        error_message TEXT,
        failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')

    conn.commit()
    conn.close()

init_db()

BOT_USER_AGENTS = [
    "bot", "crawler", "spider", "slurp", "facebookexternalhit",
    "whatsapp", "telegrambot", "twitterbot", "bingbot", "googlebot"
]

def is_bot_request(user_agent: str) -> bool:
    if not user_agent:
        return True
    ua_lower = user_agent.lower()
    return any(bot in ua_lower for bot in BOT_USER_AGENTS)

@app.route('/health')
def health():
    return jsonify({
        "status": "healthy",
        "service": "autonomous-affiliate-suite",
        "database": "sqlite3-wal",
        "timestamp": datetime.utcnow().isoformat()
    })

@app.route('/api/contextual')
def contextual_campaigns():
    category = (request.args.get('category') or '').lower().strip()
    title = (request.args.get('title') or '').lower().strip()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM campaigns WHERE status = 'active'")
    rows = cursor.fetchall()
    conn.close()

    campaigns = [dict(r) for r in rows]

    if not campaigns:
        campaigns = [
            {
                "campaign_id": "lendingkart_credit",
                "title": "Lendingkart MSME Working Capital Loans (up to ₹50L)",
                "deal_price": 0.0,
                "original_price": 50000.0,
                "affiliate_url": "https://www.lendingkart.com/business-loan/",
                "sector": "finance",
                "badge_text": "Instant ₹50L Disbursal",
                "status": "active",
                "total_clicks": 142,
                "total_conversions": 18,
            },
            {
                "campaign_id": "jsw_steel_tmt",
                "title": "JSW One MSME Bulk TMT Rebars & Steel Beams",
                "deal_price": 52000.0,
                "original_price": 58000.0,
                "affiliate_url": "https://www.jswonemsme.com/products/steel",
                "sector": "Construction",
                "badge_text": "Direct Mill Pricing",
                "status": "active",
                "total_clicks": 98,
                "total_conversions": 12,
            },
            {
                "campaign_id": "mybillbook_gst",
                "title": "myBillBook GST Invoicing & E-Way Bill Software",
                "deal_price": 799.0,
                "original_price": 1499.0,
                "affiliate_url": "https://mybillbook.in/contractors",
                "sector": "IT",
                "badge_text": "Govt GST Ready",
                "status": "active",
                "total_clicks": 64,
                "total_conversions": 9,
            },
        ]

    matched = []
    tokens = [t for t in (category + " " + title).split() if len(t) > 2]
    for c in campaigns:
        score = 0
        c_sector = (c.get('sector') or '').lower()
        c_title = (c.get('title') or '').lower()
        if category and (category in c_sector or category in c_title):
            score += 3
        for tok in tokens:
            if tok in c_title or tok in c_sector:
                score += 1
        if score > 0:
            matched.append((score, c))

    if matched:
        matched.sort(key=lambda x: x[0], reverse=True)
        results = [m[1] for m in matched]
    else:
        results = campaigns

    return jsonify({
        "status": "success",
        "count": len(results),
        "campaigns": results,
    })

@app.route('/go/<campaign_id>')
def redirect_link(campaign_id):
    ua = request.headers.get('User-Agent', '')
    ip = request.remote_addr or '127.0.0.1'
    is_bot = 1 if is_bot_request(ua) else 0

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT affiliate_url FROM campaigns WHERE campaign_id = ?", (campaign_id,))
    row = cursor.fetchone()

    # Log click
    cursor.execute(
        "INSERT INTO clicks (campaign_id, user_agent, ip_address, is_bot) VALUES (?, ?, ?, ?)",
        (campaign_id, ua, ip, is_bot)
    )

    if not is_bot:
        cursor.execute(
            "UPDATE campaigns SET total_clicks = total_clicks + 1 WHERE campaign_id = ?",
            (campaign_id,)
        )

    conn.commit()
    conn.close()

    target_url = row['affiliate_url'] if row else "https://omnibid.in"

    # Synchronize campaign redirects with OmniBid tracking params
    ch = request.args.get('ch', 'web_auction')
    campaign = request.args.get('campaign', campaign_id)
    req_id = request.args.get('reqId') or request.args.get('req_id')
    utm_source = request.args.get('utm_source', 'omnibid_india')
    utm_medium = request.args.get('utm_medium', 'b2b_marketplace')
    utm_campaign = request.args.get('utm_campaign', campaign)

    try:
        parsed = urlparse(target_url)
        query_dict = parse_qs(parsed.query)
        query_dict['utm_source'] = [utm_source]
        query_dict['utm_medium'] = [utm_medium]
        query_dict['utm_campaign'] = [utm_campaign]
        query_dict['ch'] = [ch]
        if req_id:
            query_dict['req_id'] = [req_id]
        new_query = urlencode(query_dict, doseq=True)
        target_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))
    except Exception:
        pass

    return redirect(target_url, code=302)

@app.route('/postback/conversion', methods=['POST'])
def conversion_webhook():
    signature = request.headers.get('X-Signature', '')
    raw_payload = request.get_data(as_text=True)

    # HMAC validation
    expected_sig = hmac.new(
        POSTBACK_SECRET.encode('utf-8'),
        raw_payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_sig, signature):
        return jsonify({"status": "error", "message": "Invalid HMAC signature"}), 401

    data = request.get_json() or {}
    tx_id = data.get('transaction_id')
    campaign_id = data.get('campaign_id')
    sale_amount = float(data.get('sale_amount', 0))
    commission = float(data.get('commission_amount', 0))

    if not tx_id or not campaign_id:
        return jsonify({"status": "error", "message": "transaction_id and campaign_id required"}), 400

    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cursor = conn.cursor()

        cursor.execute('''
        INSERT INTO conversions (transaction_id, campaign_id, sale_amount, commission_amount)
        VALUES (?, ?, ?, ?)
        ''', (tx_id, campaign_id, sale_amount, commission))

        cursor.execute(
            "UPDATE campaigns SET total_conversions = total_conversions + 1 WHERE campaign_id = ?",
            (campaign_id,)
        )

        conn.commit()
        return jsonify({"status": "success", "message": "Conversion recorded atomically", "transaction_id": tx_id})
    except sqlite3.IntegrityError:
        conn.rollback()
        return jsonify({"status": "ignored", "message": "Idempotent duplicate transaction skipped"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    app.run(host='0.0.0.0', port=port, debug=False)
