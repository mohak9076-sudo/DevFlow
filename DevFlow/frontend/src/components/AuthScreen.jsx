import React, { useState } from "react";
import {
  Code2,
  Zap,
  BarChart3,
  Shield,
  Bot,
  Mail,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  ArrowRight,
  GitBranch,
  ShieldCheck,
  X,
} from "lucide-react";

const API_BASE = "http://localhost:8000";

export default function AuthScreen({ isOpen = true, onClose, onAuthSuccess }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const isRegister = mode === "register";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = isRegister ? "/auth/register" : "/auth/login";
    const username = email.split("@")[0];

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");

      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem("devflow_token", data.access_token);
      storage.setItem("devflow_user", JSON.stringify(data.user));

      onAuthSuccess?.(data.user, data.access_token);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#070614] text-slate-100 selection:bg-violet-500/30">
      {/* Deep Purple / Indigo Ambient Glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-[460px] w-[620px] rounded-full bg-violet-700/20 blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 h-[420px] w-[520px] rounded-full bg-indigo-600/20 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(rgba(139, 92, 246, 0.35) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-between px-6 py-6 lg:px-10">
        {/* Top Bar */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-lg font-bold tracking-tight text-violet-400">
              &lt;/&gt;
            </span>
            <span className="text-xl font-bold tracking-tight text-white">
              DevFlow
            </span>
          </div>

          <div className="flex items-center gap-4">
            <p className="text-xs sm:text-sm text-slate-400">
              {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(isRegister ? "login" : "register");
                  setError("");
                }}
                className="inline-flex items-center gap-1 font-semibold text-violet-400 hover:text-violet-300 transition"
              >
                {isRegister ? "Sign in" : "Sign up"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </p>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Continue to app"
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {/* Main Split Content */}
        <main className="my-auto grid grid-cols-1 items-center gap-12 py-10 lg:grid-cols-12 lg:gap-10">
          {/* Left Column: Pitch & Features (No fake bottom-left stats) */}
          <div className="space-y-7 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-950/50 px-3.5 py-1.5 text-xs font-medium text-violet-300">
              <Zap className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
              <span>AI-Powered GitHub Analyzer</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl leading-[1.08]">
                Understand.
                <br />
                Analyze.{" "}
                <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  Improve.
                </span>
              </h1>
              <p className="max-w-xl text-base text-slate-300/90 leading-relaxed">
                Turn any GitHub repository into deep insights — with AI-powered
                analysis, rich visualizations, and actionable recommendations.
              </p>
            </div>

            {/* 3 Core Capabilities */}
            <div className="space-y-4 pt-1">
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-400/25 bg-indigo-500/15 text-indigo-300">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Advanced Analytics
                  </h3>
                  <p className="text-xs text-slate-400">
                    Architecture, code health, and report insights
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-purple-400/25 bg-purple-500/15 text-purple-300">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Security Intelligence
                  </h3>
                  <p className="text-xs text-slate-400">
                    Detect vulnerabilities &amp; repository risks
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-400/25 bg-violet-500/15 text-violet-300">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    AI Assistant
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ask Sentinal questions about any repository
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Auth Card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="w-full max-w-md rounded-2xl border border-violet-500/25 bg-[#121026]/90 p-7 sm:p-8 shadow-[0_20px_70px_rgba(76,29,149,0.35)] backdrop-blur-xl">
              {/* Card Brand Header */}
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center gap-2">
                  <span className="font-mono text-base font-bold text-violet-400">
                    &lt;/&gt;
                  </span>
                  <span className="text-lg font-bold text-white">DevFlow</span>
                </div>
                <h2 className="mt-2.5 text-xl font-bold text-white">
                  {isRegister ? "Create your account" : "Welcome back!"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {isRegister
                    ? "Start analyzing repositories with DevFlow"
                    : "Sign in to continue your journey"}
                </p>
              </div>

              {/* Mode Switcher Pills */}
              <div className="mb-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
                    !isRegister
                      ? "bg-gradient-to-r from-purple-600 via-violet-600 to-blue-600 text-white shadow-[0_0_24px_rgba(124,58,237,0.45)]"
                      : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                  }`}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign In
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
                    isRegister
                      ? "bg-gradient-to-r from-purple-600 via-violet-600 to-blue-600 text-white shadow-[0_0_24px_rgba(124,58,237,0.45)]"
                      : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                  }`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Create Account
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#1a1736]/90 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-400 focus:border-violet-400 focus:outline-none transition"
                  />
                </div>

                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#1a1736]/90 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-400 focus:border-violet-400 focus:outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-2.5 rounded p-0.5 text-slate-400 hover:text-slate-200 transition"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {!isRegister && (
                  <div className="flex items-center justify-between pt-0.5 text-xs">
                    <label className="flex cursor-pointer items-center gap-2 text-slate-400 hover:text-slate-200">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 accent-violet-500"
                      />
                      <span>Remember me</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setError("Password reset isn't enabled yet in local mode.")
                      }
                      className="text-violet-400 hover:text-violet-300 transition"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {error && (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-300">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-violet-600 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-[0_0_28px_rgba(124,58,237,0.45)] hover:brightness-110 disabled:opacity-60 transition"
                >
                  <span>
                    {loading
                      ? "Please wait..."
                      : isRegister
                      ? "Create Account"
                      : "Sign In"}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              {/* OAuth Divider */}
              <div className="my-5 flex items-center gap-3 text-[11px] text-slate-400">
                <div className="h-px flex-1 bg-white/10" />
                <span>or continue with</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              {/* GitHub & Google Buttons */}
              <div className="grid grid-cols-2 gap-2.5">
                <a
                  href={`${API_BASE}/auth/github`}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#1a1736]/90 px-3 py-2.5 text-xs font-medium text-slate-200 hover:border-violet-400/40 hover:bg-[#221e46] transition"
                >
                  <Github className="h-4 w-4" />
                  <span>Continue with GitHub</span>
                </a>

                <button
                  type="button"
                  onClick={() =>
                    setError(
                      "Google OAuth isn't wired in auth.py yet—use GitHub or Email above."
                    )
                  }
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#1a1736]/90 px-3 py-2.5 text-xs font-medium text-slate-200 hover:border-violet-400/40 hover:bg-[#221e46] transition"
                >
                  <span className="text-sm font-bold leading-none text-amber-400">
                    G
                  </span>
                  <span>Continue with Google</span>
                </button>
              </div>

              {/* Security Footer */}
              <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Your data is secure and never shared</span>
              </div>
            </div>
          </div>
        </main>

        {/* Bottom spacer for vertical balance */}
        <div className="h-2" />
      </div>
    </div>
  );
}