// Circuit — a stand-in for the Paystack API, for load tests only (see load-test.mjs).
// Run the app with PAYSTACK_BASE_URL=http://localhost:4010 and a sk_test_ key.
//   charges:   every initialized charge verifies as paid, for the amount it was created with
//   transfers: ~10% come back "success", ~10% are rejected (the app must restore the balance), the rest "pending"
//   /_transfer/<recipient> tells the harness the reference of that recipient's latest transfer
import { createServer } from "http";

export function startFakePaystack(port = 4010) {
  const charges = new Map();
  const transfers = new Map();
  const latestByRecipient = new Map();
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      const url = new URL(req.url, "http://x");
      const body = raw ? JSON.parse(raw) : {};
      setTimeout(() => {
        if (req.method === "POST" && url.pathname === "/transaction/initialize") {
          charges.set(body.reference, body.amount);
          return send(200, { status: true, data: { authorization_url: `http://localhost:${port}/pay/${body.reference}`, reference: body.reference } });
        }
        if (url.pathname.startsWith("/transaction/verify/")) {
          const ref = decodeURIComponent(url.pathname.split("/").pop());
          return send(200, { status: true, data: { status: "success", amount: charges.get(ref) ?? 0, currency: "NGN", reference: ref, paid_at: new Date().toISOString() } });
        }
        if (req.method === "POST" && url.pathname === "/transfer") {
          const r = Math.random();
          if (r < 0.1) return send(400, { status: false, message: "Insufficient balance" });
          transfers.set(body.reference, r < 0.2 ? "success" : "pending");
          latestByRecipient.set(body.recipient, body.reference);
          return send(200, { status: true, data: { status: transfers.get(body.reference), reference: body.reference } });
        }
        if (url.pathname.startsWith("/transfer/verify/")) {
          const ref = decodeURIComponent(url.pathname.split("/").pop());
          return send(200, { status: true, data: { status: "success", reference: ref } });
        }
        if (req.method === "POST" && url.pathname === "/refund") return send(200, { status: true, data: { status: "processed", transaction: { reference: body.transaction } } });
        if (url.pathname === "/balance") return send(200, { status: true, data: [{ currency: "NGN", balance: 1_000_000_000_000 }] });
        if (url.pathname.startsWith("/_transfer/")) return send(200, { reference: latestByRecipient.get(decodeURIComponent(url.pathname.split("/").pop())) ?? null });
        send(404, { status: false, message: "not found" });
      }, 40); // a little provider latency
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startFakePaystack();
  console.log("fake paystack on :4010");
}
