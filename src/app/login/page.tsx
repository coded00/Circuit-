import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 700px 500px at 50% -10%, rgba(124,58,237,0.4), transparent 65%)," +
            "linear-gradient(180deg, #140f1f, #0b0d10 55%)",
        }}
      />
      <div className="relative z-10 flex w-full flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" />
          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Log in to Circuit</h1>
          <p className="max-w-xs text-sm text-muted">
            Find a tournament. Join a Battle. Skip the WhatsApp chaos.
          </p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
