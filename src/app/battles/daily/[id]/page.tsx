/** Old address of a Daily Challenge. A challenge of either kind lives at /battles/[id]. */
import { redirect } from "next/navigation";

export default async function DailyChallengeRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/battles/${id}`);
}
