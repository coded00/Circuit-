import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="card w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex items-center gap-1.5 font-display text-xl font-bold tracking-wide">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundImage: "var(--brand-gradient)" }} />
            CIRCUIT
          </span>
          <h1 className="text-section-heading">Log in to Circuit</h1>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
