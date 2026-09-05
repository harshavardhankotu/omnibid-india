import os
import sqlite3
import hmac
import hashlib
import time
import re
from datetime import datetime
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
