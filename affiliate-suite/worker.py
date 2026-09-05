import time
import os
import sqlite3
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'marketing.db')

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def check_circuit_breaker(provider: str) -> bool:
    """Returns True if circuit breaker allows requests (CLOSED or HALF_OPEN)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT state, failure_count, last_failure_at FROM circuit_breaker_state WHERE provider = ?", (provider,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return True

    state = row['state']
    if state == 'OPEN':
        # Cooldown check (60s)
        last_failure = datetime.fromisoformat(row['last_failure_at'])
        if (datetime.utcnow() - last_failure).total_seconds() > 60:
            return True # Can try in HALF_OPEN state
        return False
    return True

def record_circuit_failure(provider: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    INSERT INTO circuit_breaker_state (provider, state, failure_count, last_failure_at)
    VALUES (?, 'OPEN', 1, ?)
    ON CONFLICT(provider) DO UPDATE SET
        failure_count = failure_count + 1,
        state = CASE WHEN failure_count >= 3 THEN 'OPEN' ELSE 'HALF_OPEN' END,
        last_failure_at = excluded.last_failure_at
    ''', (provider, datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()

def run_worker_loop():
    print("🚀 Affiliate Suite Background Worker daemon active...")
    while True:
        try:
            # Check circuit breaker before scheduling Playwright / API sweeps
            if check_circuit_breaker("playwright"):
                # Simulating deal ingestion worker tasks
                pass
            else:
                print("⏸️ Playwright Circuit Breaker is OPEN. Pausing outbound scraper tasks.")
        except Exception as e:
            print(f"Worker iteration exception: {e}")
        time.sleep(10)

if __name__ == "__main__":
    run_worker_loop()
