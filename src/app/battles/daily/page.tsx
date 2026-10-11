/** Old address of the Daily feed. Daily challenges are now part of the Challenges board itself. */
import { redirect } from "next/navigation";

export default function DailyChallengesRedirect() {
  redirect("/battles?kind=daily");
}
