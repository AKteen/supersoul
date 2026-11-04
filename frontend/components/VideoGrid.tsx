"use client";

import { useEffect, useRef } from "react";
import type { ILocalVideoTrack, IRemoteVideoTrack } from "agora-rtc-sdk-ng";

type Tile = {
  id: string;
  label: string;
  track: ILocalVideoTrack | IRemoteVideoTrack | null;
  mirrored?: boolean;
};

function VideoTile({ label, track, mirrored }: Omit<Tile, "id">) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.play(el);
    return () => {
      track.stop();
    };
  }, [track]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-zinc-900">
      <div
        ref={ref}
        className={`h-full w-full ${mirrored ? "[transform:scaleX(-1)]" : ""}`}
      />
      {!track ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
          Camera off
        </div>
      ) : null}
      <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
        {label}
      </span>
    </div>
  );
}

export function VideoGrid({ tiles }: { tiles: Tile[] }) {
  const count = Math.max(tiles.length, 1);
  const cols =
    count === 1 ? "grid-cols-1" : count === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid gap-3 ${cols}`}>
      {tiles.map((tile) => (
        <VideoTile
          key={tile.id}
          label={tile.label}
          track={tile.track}
          mirrored={tile.mirrored}
        />
      ))}
    </div>
  );
}
