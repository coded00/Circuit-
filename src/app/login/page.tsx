import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="h-2.5 w-2.5 rounded-full bg-brand" />
        <h1 className="mt-2 text-2xl font-semibold">Log in to Circuit</h1>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
