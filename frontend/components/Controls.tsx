"use client";

type ControlsProps = {
  micOn: boolean;
  camOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
};

export function Controls({ micOn, camOn, onToggleMic, onToggleCam, onLeave }: ControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={onToggleMic}
        className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
      >
        {micOn ? "Mute" : "Unmute"}
      </button>
      <button
        type="button"
        onClick={onToggleCam}
        className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
      >
        {camOn ? "Camera off" : "Camera on"}
      </button>
      <button
        type="button"
        onClick={onLeave}
        className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white"
      >
        Leave
      </button>
    </div>
  );
}
