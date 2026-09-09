import { Suspense } from "react";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="card w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex items-center gap-1.5 font-display text-xl font-bold tracking-wide">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundImage: "var(--brand-gradient)" }} />
            CIRCUIT
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-section-heading">Create your Circuit account</h1>
            <p className="text-sm text-muted">Two fields, no payment info. Start playing in seconds.</p>
          </div>
        </div>
        <Suspense>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
