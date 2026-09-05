import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import DeleteAccount from "@/components/account/DeleteAccount";

// Account settings. Currently one thing: deleting the account.
//
// Part of the privacy pass — "what an account deletion actually removes end to
// end" was undefined before this, and there was no way for a learner to ask for
// one at all. The admin console can action the same deletion for someone who
// has lost access; both call lib/account/deleteAccount.ts.
//
// Rule 4: fits the viewport, does not scroll.
export default async function AccountPage() {
  const supabase = await createClient();
  const { user } = await verifyUserAccess(supabase);

  return (
    <div className="flex h-screen flex-col bg-[#0F172A] px-6 py-8">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6">

        <div>
          <Link
            href="/home"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft size={13} />
            Back to your activities
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-slate-100">Your account</h1>
          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
        </div>

        <DeleteAccount email={user.email ?? ""} />

        <Link
          href="/privacy"
          className="text-center text-xs text-slate-600 transition-colors hover:text-slate-400"
        >
          What Hugh stores about you
        </Link>

      </div>
    </div>
  );
}
