"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/Icon";

type ControlsProps = {
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  chatOpen: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreen: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
};

function RoundButton({
  label,
  onClick,
  inverted,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  inverted?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  const tone = danger
    ? "bg-[#dc143c] text-white hover:bg-[#b01030]"
    : inverted
      ? "bg-white text-black"
      : "bg-[#2a2a2a] text-white hover:bg-[#343434]";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-full ${tone}`}
    >
      {children}
    </button>
  );
}

export function Controls({
  micOn,
  camOn,
  sharing,
  chatOpen,
  onToggleMic,
  onToggleCam,
  onToggleScreen,
  onToggleChat,
  onLeave,
}: ControlsProps) {
  return (
    <div className="flex items-center gap-3 rounded-full bg-[#1a1a1a] px-4 py-3 shadow-lg ring-1 ring-white/10">
      <RoundButton label={micOn ? "Mute" : "Unmute"} onClick={onToggleMic} inverted={!micOn}>
        <Icon name={micOn ? "mic" : "mic_off"} filled={!micOn} />
      </RoundButton>
      <RoundButton label={camOn ? "Turn camera off" : "Turn camera on"} onClick={onToggleCam} inverted={!camOn}>
        <Icon name={camOn ? "videocam" : "videocam_off"} filled={!camOn} />
      </RoundButton>
      <RoundButton label={sharing ? "Stop sharing" : "Share screen"} onClick={onToggleScreen} inverted={sharing}>
        <Icon name={sharing ? "stop_screen_share" : "screen_share"} filled={sharing} />
      </RoundButton>
      <RoundButton label={chatOpen ? "Hide chat" : "Show chat"} onClick={onToggleChat} inverted={chatOpen}>
        <Icon name="chat" filled={chatOpen} />
      </RoundButton>
      <RoundButton label="Leave" onClick={onLeave} danger>
        <Icon name="call_end" filled />
      </RoundButton>
    </div>
  );
}
