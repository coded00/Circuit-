/**
 * Circuit — Nigerian bank list endpoint.
 *
 * Fetches active banks from Paystack's /bank API for account linking.
 * Results are cached in-memory with a 1-hour TTL to avoid hitting Paystack rate limits.
 * If Paystack keys are not set (e.g. initial dev), provides a fallback list of major banks.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listBanks, BankItem } from "@/lib/payments/paystack";

let cachedBanks: BankItem[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const FALLBACK_BANKS: BankItem[] = [
  { name: "Access Bank", code: "044", slug: "access-bank" },
  { name: "First Bank of Nigeria", code: "011", slug: "first-bank-of-nigeria" },
  { name: "Guaranty Trust Bank (GTBank)", code: "058", slug: "guaranty-trust-bank" },
  { name: "Kuda Bank", code: "50211", slug: "kuda-bank" },
  { name: "Moniepoint MFB", code: "50515", slug: "moniepoint-mfb-ng" },
  { name: "OPay", code: "999992", slug: "opay" },
  { name: "Stanbic IBTC Bank", code: "221", slug: "stanbic-ibtc-bank" },
  { name: "United Bank For Africa (UBA)", code: "033", slug: "united-bank-for-africa" },
  { name: "Zenith Bank", code: "057", slug: "zenith-bank" },
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = Date.now();
  if (cachedBanks && now < cacheExpiry) {
    return NextResponse.json({ banks: cachedBanks });
  }

  try {
    const banks = await listBanks();
    cachedBanks = banks;
    cacheExpiry = now + CACHE_TTL_MS;
    return NextResponse.json({ banks });
  } catch (error) {
    console.warn("[banks] Failed to fetch bank list from Paystack; using fallback list:", error);
    return NextResponse.json({ banks: FALLBACK_BANKS });
  }
}
