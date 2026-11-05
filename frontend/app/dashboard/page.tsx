"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { AuthGuard } from "@/components/AuthGuard";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
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
  const [joinLink, setJoinLink] = useState("");
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
      try {
        await navigator.clipboard.writeText(shareUrl(room));
        setCopied(room.slug);
      } catch {
        /* copy is optional; the room is already created */
      }
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

  function slugFromLink(raw: string): string | null {
    const text = raw.trim();
    if (!text) return null;
    try {
      const url = new URL(text);
      const parts = url.pathname.split("/").filter(Boolean);
      const roomIndex = parts.indexOf("room");
      const slug = roomIndex >= 0 ? parts[roomIndex + 1] : parts[parts.length - 1];
      return slug || null;
    } catch {
      const cleaned = text.replace(/^\/+/, "").replace(/^room\//, "");
      return cleaned.split(/[/?#]/)[0] || null;
    }
  }

  function onJoin(e: FormEvent) {
    e.preventDefault();
    const slug = slugFromLink(joinLink);
    if (!slug) {
      setError("Paste a room link or slug");
      return;
    }
    router.push(`/room/${slug}`);
  }

  function logout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen w-full flex-col px-6 py-6 sm:px-10">
      <header className="flex items-center justify-between pr-14">
        <Logo />
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
        >
          <Icon name="logout" size={16} />
          Log out
        </button>
      </header>

      <div className="grid flex-1 items-center gap-12 py-8 lg:grid-cols-2">
        <section>
          <h1 className="text-4xl font-medium tracking-tight text-white">Join a meeting</h1>
          <p className="mt-2 text-sm text-zinc-400">Enter a meeting code or link to join</p>
          {user ? <p className="mt-1 text-xs text-zinc-500">Signed in as {user.name}</p> : null}

          <form onSubmit={onJoin} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <input
              required
              value={joinLink}
              onChange={(e) => setJoinLink(e.target.value)}
              placeholder="Meeting code or link"
              className="flex-1 rounded-xl border border-white/10 bg-[#161616] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/30"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-black hover:bg-zinc-200"
            >
              Join
              <Icon name="arrow_forward" size={16} />
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={onCreate} className="flex flex-col gap-3">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New meeting name"
              className="rounded-xl border border-white/10 bg-[#161616] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/30"
            />
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#1c1c1c] px-5 py-3 text-sm font-medium text-white hover:bg-[#262626] disabled:opacity-60"
            >
              <Icon name="videocam" size={16} />
              {creating ? "Starting…" : "New meeting"}
            </button>
          </form>
          {error ? <p className="mt-3 text-sm text-zinc-300">{error}</p> : null}
          <p className="mt-8 text-xs text-zinc-500">By joining, you agree to the terms of service.</p>
        </section>

        <section className="flex h-full min-h-0 flex-col justify-center">
          <h2 className="text-sm font-medium text-zinc-400">My meetings</h2>
          {rooms.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No meetings yet.</p>
          ) : (
            <ul className="mt-3 max-h-[70vh] divide-y divide-white/10 overflow-y-auto">
              {rooms.map((room) => (
                <li key={room.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-white">{room.title}</p>
                    <p className="text-sm text-zinc-500">{room.slug}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => copyLink(room)}
                      className="inline-flex items-center gap-1 rounded-full bg-[#2a2a2a] px-3 py-1.5 text-white hover:bg-[#343434]"
                    >
                      <Icon name={copied === room.slug ? "check" : "content_copy"} size={14} />
                      {copied === room.slug ? "Copied" : "Copy"}
                    </button>
                    <Link
                      href={room.share_path}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-black"
                    >
                      <Icon name="videocam" size={14} />
                      Open
                    </Link>
                    <Link
                      href={`/room/${room.slug}/history`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#2a2a2a] px-3 py-1.5 text-white hover:bg-[#343434]"
                    >
                      <Icon name="history" size={14} />
                      History
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
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
