// Circuit — a stand-in for the Paystack API, for load tests only (see load-test.mjs).
// Run the app with PAYSTACK_BASE_URL=http://localhost:4010 and a sk_test_ key.
//   charges:   every initialized charge verifies as paid, for the amount it was created with
//   transfers: ~10% come back "success", ~10% are rejected (the app must restore the balance), the rest "pending"
//   /_transfer/<recipient> tells the harness the reference of that recipient's latest transfer
import { createServer } from "http";
import { createHmac } from "crypto";

export function startFakePaystack(port = 4010) {
  const charges = new Map();
  const callbacks = new Map();
  const paid = new Set();
  const requirePay = process.env.FAKE_REQUIRE_PAY === "1"; // browser tests: a charge only verifies as paid after its checkout page's Pay button
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
          callbacks.set(body.reference, body.callback_url);
          return send(200, { status: true, data: { authorization_url: `http://localhost:${port}/pay/${body.reference}`, reference: body.reference } });
        }
        if (url.pathname.startsWith("/transaction/verify/")) {
          const ref = decodeURIComponent(url.pathname.split("/").pop());
          const isPaid = !requirePay || paid.has(ref);
          return send(200, { status: true, data: { status: isPaid ? "success" : "abandoned", amount: charges.get(ref) ?? 0, currency: "NGN", reference: ref, paid_at: isPaid ? new Date().toISOString() : null } });
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
        if (req.method === "GET" && url.pathname.startsWith("/pay/")) {
          const ref = decodeURIComponent(url.pathname.split("/").pop());
          res.writeHead(200, { "content-type": "text/html" });
          return res.end(`<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px"><h2>Fake Paystack checkout</h2><p>Pay NGN ${((charges.get(ref) ?? 0) / 100).toLocaleString()} (test)</p><form method=post action="/_pay/${encodeURIComponent(ref)}"><button style="padding:12px 20px;font-size:16px">Pay now</button></form><p><a href="${callbacks.get(ref) ?? "/"}">Close without paying</a></p></body>`);
        }
        if (req.method === "POST" && url.pathname.startsWith("/_pay/")) {
          const ref = decodeURIComponent(url.pathname.split("/").pop());
          paid.add(ref);
          const payload = JSON.stringify({ event: "charge.success", data: { reference: ref } });
          const sig = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY ?? "").update(payload).digest("hex");
          fetch(`${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks/paystack`, { method: "POST", headers: { "content-type": "application/json", "x-paystack-signature": sig }, body: payload })
            .catch(() => undefined)
            .finally(() => { res.writeHead(302, { location: callbacks.get(ref) ?? "/" }); res.end(); });
          return;
        }
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
