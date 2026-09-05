import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import LogoutButton from "./LogoutButton";

export default async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="flex items-center justify-between border-b border-black/10 px-6 py-3 text-sm dark:border-white/15">
      <div className="flex items-center gap-4">
        <Link href="/" className="font-semibold">
          Circuit
        </Link>
        <Link href="/battles" className="text-zinc-500">
          Battles
        </Link>
        <Link href="/ladder" className="text-zinc-500">
          Ladders
        </Link>
      </div>
      <div className="flex items-center gap-4">
        {user ? (
          <>
            <span className="text-zinc-500">@{user.handle}</span>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/login" className="font-medium">
              Log in
            </Link>
            <Link href="/signup" className="font-medium">
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
