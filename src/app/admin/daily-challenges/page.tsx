/** Old address of the Daily Challenges admin list. They are a tab of Challenges now. */
import { redirect } from "next/navigation";

export default function AdminDailyChallengesRedirect() {
  redirect("/admin/challenges?kind=daily");
}
