import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 py-32 text-center dark:bg-black">
      <h1 className="text-4xl font-semibold tracking-tight">Circuit</h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Tournament and 1v1 Battle platform for Nigeria-first esports organizers.
      </p>
      <div className="flex gap-4">
        {user ? (
          <Link
            href="/tournaments/new"
            className="rounded-full bg-foreground px-6 py-3 font-medium text-background"
          >
            Create a tournament
          </Link>
        ) : (
          <>
            <Link
              href="/signup"
              className="rounded-full bg-foreground px-6 py-3 font-medium text-background"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-black/15 px-6 py-3 font-medium dark:border-white/20"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
