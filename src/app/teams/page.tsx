/**
 * Circuit — Teams management moved to the profile page's own Teams tab
 * (src/app/players/[handle]/page.tsx), matching how Steam surfaces Groups
 * on the profile rather than a separate destination. This route stays
 * alive as a redirect so existing links keep working. Individual team
 * pages (src/app/teams/[id]/page.tsx) are unaffected — this only redirects
 * the "my teams" list index.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default async function TeamsRedirectPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/teams");
  }
  redirect(`/players/${user.handle}?tab=teams`);
}
