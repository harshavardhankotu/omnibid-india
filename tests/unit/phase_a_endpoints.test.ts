import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import app from "../../server/src/app.js";

describe("Phase A: HTTP Endpoints Integration", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("GET /api/geo/pin/:pincode returns accurate City and State", async () => {
    // 500081 -> Hyderabad, Telangana
    const res = await fetch(`${baseUrl}/api/geo/pin/500081`);
    expect(res.status).toBe(200);

    const data: any = await res.json();
    expect(data.valid).toBe(true);
    expect(data.pincode).toBe("500081");
    expect(data.city).toBe("Hyderabad");
    expect(data.state).toBe("Telangana");

    // Invalid PIN code format
    const badRes = await fetch(`${baseUrl}/api/geo/pin/abc123`);
    expect(badRes.status).toBe(400);
  });

  it("POST /api/requirements/smart-parse parses messy BOQ and returns contextual affiliate offers", async () => {
    const res = await fetch(`${baseUrl}/api/requirements/smart-parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Need 500 bags Ultratech OPC 53 cement at 500081 budget 1.9L",
      }),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.parsed.quantity).toBe(500);
    expect(data.parsed.unit).toBe("bags");
    expect(data.parsed.category).toBe("Cement & Concrete");
    expect(data.parsed.pincode).toBe("500081");
    expect(data.parsed.city).toBe("Hyderabad");
    expect(data.parsed.state).toBe("Telangana");
    expect(data.parsed.budgetInr).toBe(190000);
    expect(Array.isArray(data.contextualOffers)).toBe(true);
    expect(data.contextualOffers.length).toBeGreaterThan(0);
  });

  it("POST /api/push/subscribe registers client Web Push subscription", async () => {
    const res = await fetch(`${baseUrl}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "user-test-contractor-456",
        subscription: {
          endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test-endpoint-456",
          keys: {
            p256dh: "test-p256dh-key",
            auth: "test-auth-key",
          },
        },
      }),
    });

    expect(res.status).toBe(201);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.subscriptionId).toBeDefined();
    expect(data.userId).toBe("user-test-contractor-456");

    // Verify subscription retrieval
    const getRes = await fetch(`${baseUrl}/api/push/subscriptions/user-test-contractor-456`);
    expect(getRes.status).toBe(200);
    const getData: any = await getRes.json();
    expect(getData.count).toBe(1);
    expect(getData.subscriptions[0].subscription.endpoint).toBe("https://updates.push.services.mozilla.com/wpush/v2/test-endpoint-456");
  });

  it("GET /api/broadcasts/recent returns last broadcasts for Admin Revenue Cockpit", async () => {
    const res = await fetch(`${baseUrl}/api/broadcasts/recent?limit=10`);
    expect(res.status).toBe(200);

    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.broadcasts)).toBe(true);
  });

  it("POST /api/broadcasts/trigger executes simulated deal broadcast", async () => {
    const res = await fetch(`${baseUrl}/api/broadcasts/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requirement: {
          id: "req_trigger_test",
          title: "20 MT TMT Bars in Hyderabad 500032",
          categoryName: "Steel & Structural Metals",
          city: "Hyderabad",
          state: "Telangana",
          maxBudget: 1200000,
        },
        l1Bid: {
          bidAmount: 1150000,
        },
      }),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.broadcast.requirementId).toBe("req_trigger_test");
    expect(data.broadcast.warRoomUrl).toContain("https://omnibid-india.onrender.com/auction/req_trigger_test");
  });
});
