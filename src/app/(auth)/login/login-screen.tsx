"use client";

import { Suspense } from "react";
import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, User, Lock, Shield } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Invalid username or password.",
  Default: "An error occurred. Please try again.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const errorParam = searchParams.get("error");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam ? (ERROR_MESSAGES[errorParam] ?? ERROR_MESSAGES.Default) : null
  );
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signIn("ldap", {
        username,
        password,
        redirect: false,
        callbackUrl,
      });
      if (result?.error) {
        setError("Invalid username or password. Please try again.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate aria-describedby={error ? "login-error" : undefined}>
      {/* Username */}
      <div>
        <label htmlFor="username" className="block text-sm font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
          Domain Username
        </label>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            id="username"
            type="text"
            autoComplete="username"
            autoFocus
            required
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isPending}
            className="w-full pl-10 pr-4 py-3 text-sm rounded-xl transition
              border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400
              focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500
              disabled:bg-slate-50 disabled:text-slate-400
              dark:border-border dark:bg-muted/60 dark:text-slate-200 dark:placeholder:text-slate-600
              dark:focus:border-orange-500/70 dark:disabled:bg-white/4"
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
          Password
        </label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
            className="w-full pl-10 pr-11 py-3 text-sm rounded-xl transition
              border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400
              focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500
              disabled:bg-slate-50 disabled:text-slate-400
              dark:border-border dark:bg-muted/60 dark:text-slate-200 dark:placeholder:text-slate-600
              dark:focus:border-orange-500/70 dark:disabled:bg-white/4"
            placeholder="Enter your password"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Keep signed in */}
      <div className="flex items-center gap-2">
        <input
          id="keep-signed-in"
          type="checkbox"
          checked={keepSignedIn}
          onChange={(e) => setKeepSignedIn(e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 dark:border-border text-orange-500 focus:ring-orange-500/40 accent-orange-500"
        />
        <label htmlFor="keep-signed-in" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
          Keep me signed in
        </label>
      </div>

      {/* Error */}
      {error && (
        <div
          id="login-error"
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2.5 text-sm rounded-xl px-4 py-3
                     text-red-700 bg-red-50 border border-red-200
                     dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20"
        >
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-4.75a.75.75 0 001.5 0V9.25a.75.75 0 00-1.5 0v4zm0-7a.75.75 0 001.5 0 .75.75 0 00-1.5 0z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending || !username || !password}
        className="w-full py-3 px-4 text-sm font-bold text-white rounded-xl focus:outline-none
                   focus:ring-2 focus:ring-orange-500 focus:ring-offset-2
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-150 hover:opacity-90 active:scale-[0.99]
                   flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" }}
      >
        {isPending ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Signing in...
          </>
        ) : (
          <>
            Sign in to FormFlow
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </>
        )}
      </button>
    </form>
  );
}

/** Simple centred login card. */
export function LoginScreen() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0b1120]">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          {/* Card */}
          <div className="rounded-2xl border border-black/8 bg-white p-7 shadow-card
                          dark:border-border dark:bg-card dark:shadow-none">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                   style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
                <Shield className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">FormFlow</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Sign in with your domain account
              </p>
            </div>

            <Suspense
              fallback={
                <div className="space-y-4" aria-hidden="true">
                  <div className="h-[70px] rounded-xl bg-slate-100 dark:bg-muted/60" />
                  <div className="h-[70px] rounded-xl bg-slate-100 dark:bg-muted/60" />
                  <div className="h-11 rounded-xl bg-slate-100 dark:bg-muted/60" />
                </div>
              }
            >
              <LoginForm />
            </Suspense>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Shield className="h-3 w-3" aria-hidden="true" />
            Internal use only
          </p>
        </div>
      </main>
    </div>
  );
}
