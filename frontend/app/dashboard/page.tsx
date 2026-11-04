"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { AuthGuard } from "@/components/AuthGuard";
import { ApiError, Room, User, api } from "@/lib/api";
import { clearToken } from "@/lib/auth";

function shareUrl(room: Room): string {
  if (typeof window === "undefined") return room.share_path;
  return `${window.location.origin}${room.share_path}`;
}

function DashboardInner() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [me, mine] = await Promise.all([api.me(), api.myRooms()]);
    setUser(me);
    setRooms(mine);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        router.replace("/login");
      }
    });
  }, [load, router]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const room = await api.createRoom({ title });
      setTitle("");
      setRooms((prev) => [room, ...prev]);
      await navigator.clipboard.writeText(shareUrl(room));
      setCopied(room.slug);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create room");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(room: Room) {
    await navigator.clipboard.writeText(shareUrl(room));
    setCopied(room.slug);
  }

  function logout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">SuperSoul</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dashboard</h1>
          {user ? (
            <p className="mt-1 text-sm text-zinc-500">
              Signed in as {user.name} ({user.email})
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-zinc-500 underline underline-offset-2"
        >
          Log out
        </button>
      </header>

      <section className="mb-12">
        <h2 className="text-lg font-medium">Create a room</h2>
        <p className="mt-1 text-sm text-zinc-500">Share the link so others can join your call.</p>
        <form onSubmit={onCreate} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Room title"
            className="flex-1 rounded border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {creating ? "Creating…" : "Create & copy link"}
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </section>

      <section>
        <h2 className="text-lg font-medium">My rooms</h2>
        {rooms.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No rooms yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {rooms.map((room) => (
              <li key={room.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{room.title}</p>
                  <p className="text-sm text-zinc-500">/{room.slug}</p>
                </div>
                <div className="flex gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => copyLink(room)}
                    className="underline underline-offset-2"
                  >
                    {copied === room.slug ? "Copied" : "Copy link"}
                  </button>
                  <Link href={room.share_path} className="underline underline-offset-2">
                    Open
                  </Link>
                  <Link href={`/room/${room.slug}/history`} className="underline underline-offset-2">
                    History
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardInner />
    </AuthGuard>
  );
}
