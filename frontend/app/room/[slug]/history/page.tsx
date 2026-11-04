"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthGuard } from "@/components/AuthGuard";
import { ApiError, CallSession, api } from "@/lib/api";

function HistoryInner({ slug }: { slug: string }) {
  const [sessions, setSessions] = useState<CallSession[]>([]);
  const [title, setTitle] = useState(slug);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getRoom(slug), api.roomSessions(slug)])
      .then(([room, list]) => {
        setTitle(room.title);
        setSessions(list);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load history");
      });
  }, [slug]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10">
      <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">SuperSoul</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Call history</h1>
      <p className="mt-1 text-sm text-zinc-500">{title}</p>
      <p className="mt-4 text-sm">
        <Link href={`/room/${slug}`} className="underline underline-offset-2">
          Back to room
        </Link>
        {" · "}
        <Link href="/dashboard" className="underline underline-offset-2">
          Dashboard
        </Link>
      </p>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {sessions.length === 0 && !error ? (
        <p className="mt-8 text-sm text-zinc-500">No calls logged yet.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {sessions.map((s) => (
            <li key={s.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="font-medium">
                {new Date(s.started_at).toLocaleString()}
                {s.ended_at ? ` → ${new Date(s.ended_at).toLocaleString()}` : " (active)"}
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Participants:{" "}
                {s.participants.map((p) => p.name).join(", ") || "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function RoomHistoryPage() {
  const params = useParams<{ slug: string }>();
  return (
    <AuthGuard>
      <HistoryInner slug={params.slug} />
    </AuthGuard>
  );
}
