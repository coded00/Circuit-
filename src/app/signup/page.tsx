import { Suspense } from "react";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Create your Circuit account</h1>
      <Suspense>
        <SignupForm />
      </Suspense>
    </div>
  );
}
