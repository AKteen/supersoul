"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import { AuthGuard } from "@/components/AuthGuard";

// Agora SDK must stay client-only (uses browser media APIs).
const RoomCall = dynamic(() => import("@/components/RoomCall"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
      Loading call…
    </div>
  ),
});

export default function RoomPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  return (
    <AuthGuard>
      <RoomCall slug={slug} />
    </AuthGuard>
  );
}
