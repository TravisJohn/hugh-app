import Link from "next/link";
import { ShieldOff, Mail } from "lucide-react";

export default function BlockedPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#0F172A] px-6">
      <div className="w-full max-w-md space-y-6 text-center">

        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
            <ShieldOff size={28} className="text-red-400" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-100">Access restricted</h1>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
            Your account has been restricted. If you believe this is a mistake, please get in touch.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-4 text-sm text-slate-500 leading-relaxed">
          <div className="flex items-center gap-2 justify-center">
            <Mail size={14} />
            <span>Contact <span className="text-slate-300">tjmariohn@gmail.com</span></span>
          </div>
        </div>

        <Link
          href="/login"
          className="text-xs text-slate-700 hover:text-slate-500 transition-colors"
        >
          Sign in with a different account
        </Link>

      </div>
    </div>
  );
}
