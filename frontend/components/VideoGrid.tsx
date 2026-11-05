"use client";

import { useEffect, useRef } from "react";
import type { ILocalVideoTrack, IRemoteVideoTrack } from "agora-rtc-sdk-ng";

import { Icon } from "@/components/Icon";

type Tile = {
  id: string;
  label: string;
  track: ILocalVideoTrack | IRemoteVideoTrack | null;
  mirrored?: boolean;
  micMuted?: boolean;
  camOff?: boolean;
};

function VideoTile({
  label,
  track,
  mirrored,
  micMuted,
  camOff,
  className,
}: Omit<Tile, "id"> & { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !track || camOff) return;
    track.play(el);
    return () => {
      track.stop();
    };
  }, [camOff, track]);

  return (
    <div className={`relative aspect-video overflow-hidden rounded-[28px] bg-[#141414] ring-1 ring-white/10 [&_video]:h-full [&_video]:w-full [&_video]:object-cover ${className ?? ""}`}>
      <div
        ref={ref}
        className={`h-full w-full ${mirrored ? "[transform:scaleX(-1)]" : ""}`}
      />
      <span className="absolute bottom-4 left-4 z-10 text-sm font-medium text-white drop-shadow">
        {label}
      </span>
      {micMuted || camOff ? (
        <span className="absolute bottom-4 right-4 z-10 flex gap-2">
          {micMuted ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white">
              <Icon name="mic_off" filled size={18} />
            </span>
          ) : null}
          {camOff ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white">
              <Icon name="videocam_off" filled size={18} />
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

export function VideoGrid({ tiles }: { tiles: Tile[] }) {
  const count = Math.max(tiles.length, 1);
  const cols =
    count === 1 ? "grid-cols-1" : count === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  const tileSize =
    count === 1
      ? "w-[min(100%,640px,calc(42vh*16/9))]"
      : "w-full max-h-[42vh]";

  return (
    <div className={`grid h-fit w-full content-center justify-items-center gap-3 self-center ${cols}`}>
      {tiles.map((tile) => (
        <VideoTile
          key={tile.id}
          label={tile.label}
          track={tile.track}
          mirrored={tile.mirrored}
          micMuted={tile.micMuted}
          camOff={tile.camOff}
          className={tileSize}
        />
      ))}
    </div>
  );
}
