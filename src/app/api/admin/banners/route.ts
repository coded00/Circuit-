/**
 * Circuit — admin homepage banner creation. Real content `CircuitHero`
 * renders on the actual player homepage (see that component's own
 * comment) — the whole point of Content > Homepage Carousel.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!admin.isStaff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const headline = typeof body.headline === "string" ? body.headline.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!headline || !imageUrl) {
    return NextResponse.json({ error: "Headline and image URL are required." }, { status: 400 });
  }

  const maxOrder = await prisma.homepageBanner.aggregate({ _max: { order: true } });

  const banner = await prisma.homepageBanner.create({
    data: {
      headline,
      imageUrl,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      ctaLabel: typeof body.ctaLabel === "string" ? body.ctaLabel.trim() || null : null,
      ctaHref: typeof body.ctaHref === "string" ? body.ctaHref.trim() || null : null,
      publishAt: typeof body.publishAt === "string" && body.publishAt ? new Date(body.publishAt) : null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });

  await logAdminAction({ actorId: admin.id, action: "banner.create", targetType: "HomepageBanner", targetId: banner.id });

  return NextResponse.json({ id: banner.id }, { status: 201 });
}
