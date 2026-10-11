/**
 * Circuit — first-run onboarding, straight after signup (email or
 * Google). Same launcher-style shell as the auth pages. Signed-in only;
 * someone who already finished it goes straight on.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { loginPath, safeNextPath } from "@/lib/safeRedirect";
import { ensureGameHubs, ensureOfficialCommunities } from "@/lib/communityDirectory";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { WelcomeFlow } from "./WelcomeFlow";

export const metadata: Metadata = { title: "Welcome to Circuit", robots: { index: false, follow: false } };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string; again?: string; from?: string }> }) {
  const { next: rawNext, again, from } = await searchParams;
  const next = safeNextPath(rawNext?.startsWith("/welcome") ? "/" : rawNext);
  const user = await getCurrentUser();
  if (!user) redirect(loginPath(`/welcome${rawNext ? `?next=${encodeURIComponent(rawNext)}` : ""}`));
  if (user.onboardedAt && !again) redirect(next);

  await Promise.all([ensureGameHubs(), ensureOfficialCommunities()]).catch(() => undefined);
  const [games, officials] = await Promise.all([
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, iconUrl: true } }),
    prisma.community.findMany({
      where: { kind: "OFFICIAL", enabled: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, iconUrl: true, category: true, region: true, description: true },
    }),
  ]);

  return (
    <AuthSplitLayout>
      <WelcomeFlow
        displayName={user.displayName}
        next={next}
        games={games}
        cities={officials.filter((o) => o.category === "LOCATION").map((o) => ({ id: o.id, name: o.name ?? "", iconUrl: o.iconUrl, region: o.region }))}
        interests={officials.filter((o) => o.category === "INTEREST").map((o) => ({ id: o.id, name: o.name ?? "", iconUrl: o.iconUrl, description: o.description }))}
        initialGameIds={games.filter((g) => user.favoriteGames.includes(g.name)).map((g) => g.id)}
        initialRegion={user.region ?? ""}
        // Signup already asked which games they play.
        startStep={from === "signup" ? 1 : 0}
      />
    </AuthSplitLayout>
  );
}
