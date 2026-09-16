/**
 * Circuit — Friends management moved to the profile page's own Friends
 * tab (src/app/players/[handle]/page.tsx), matching how Facebook/Steam
 * surface this on the profile rather than a separate destination. This
 * route stays alive as a redirect so existing links keep working —
 * notably FRIEND_REQUEST/FRIEND_ACCEPTED notifications
 * (src/lib/notification-format.ts) still point here.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default async function FriendsRedirectPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/friends");
  }
  redirect(`/players/${user.handle}?tab=friends`);
}
