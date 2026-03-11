import { SignIn } from "@clerk/nextjs";
import { env } from "@/lib/env";

export default function SignInPage() {
  if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-8 text-sm text-amber-900">
          Clerk is not configured yet. Add the publishable and secret keys to enable sign-in.
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
