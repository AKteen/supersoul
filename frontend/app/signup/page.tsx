"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ErrorCard } from "@/components/ErrorCard";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { ApiError, api } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.signup({ name, email, password });
      setToken(res.access_token);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-12">
      <Logo />
      <h1 className="mt-8 text-3xl font-medium tracking-tight text-white">Create account</h1>
      <p className="mt-2 text-sm text-zinc-400">Your name is shown on the call.</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm text-zinc-300">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#161616] px-4 py-3 text-white outline-none focus:border-white/30"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-zinc-300">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#161616] px-4 py-3 text-white outline-none focus:border-white/30"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-zinc-300">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#161616] px-4 py-3 text-white outline-none focus:border-white/30"
          />
        </label>
        <ErrorCard message={error} />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
        >
          <Icon name="person_add" />
          {loading ? "Creating…" : "Sign up"}
        </button>
      </form>
      <p className="mt-6 text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="text-white underline underline-offset-2">
          Log in
        </Link>
      </p>
    </main>
  );
}
