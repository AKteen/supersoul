"use client";

import AgoraRTC, {
  type IAgoraRTCClient,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
  type IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatPanel } from "@/components/ChatPanel";
import { Controls } from "@/components/Controls";
import { ErrorCard } from "@/components/ErrorCard";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { VideoGrid } from "@/components/VideoGrid";
import { ApiError, JoinPayload, Room, api, leaveRoomBeacon } from "@/lib/api";
import { getToken } from "@/lib/auth";

type RemotePeer = {
  uid: string | number;
  track: IRemoteVideoTrack | null;
  micMuted: boolean;
  camOff: boolean;
};

type RoomCallProps = {
  slug: string;
};

const TAKEN_OVER = "This meeting is open somewhere else, so this window disconnected.";

function isUidConflict(raw: string): boolean {
  return /UID_CONFLICT|UID_BANNED/i.test(raw);
}

export default function RoomCall({ slug }: RoomCallProps) {
  const router = useRouter();
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTracksRef = useRef<[IMicrophoneAudioTrack, ICameraVideoTrack] | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [joinInfo, setJoinInfo] = useState<JoinPayload | null>(null);
  const [localVideo, setLocalVideo] = useState<ICameraVideoTrack | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [selfName, setSelfName] = useState("You");
  const [namesByUid, setNamesByUid] = useState<Record<string, string>>({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [inCall, setInCall] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [joining, setJoining] = useState(false);
  const [canRejoin, setCanRejoin] = useState(false);

  const leftRef = useRef(false);
  const joinedRef = useRef(false);

  const notifyLeave = useCallback(async () => {
    if (!joinedRef.current || leftRef.current) return;
    leftRef.current = true;
    try {
      await api.leaveRoom(slug);
    } catch {
      /* best effort */
    }
  }, [slug]);

  const cleanup = useCallback(async () => {
    await notifyLeave();
    const tracks = localTracksRef.current;
    if (tracks) {
      for (const track of tracks) {
        track.stop();
        track.close();
      }
      localTracksRef.current = null;
    }
    setLocalVideo(null);
    setRemotePeers([]);
    const client = clientRef.current;
    if (client) {
      client.removeAllListeners();
      try {
        await client.leave();
      } catch {
        /* already left */
      }
      clientRef.current = null;
    }
  }, [notifyLeave]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const meta = await api.getRoom(slug);
        if (cancelled) return;
        setRoom(meta);

        const me = await api.me();
        if (!cancelled) setSelfName(me.name);

        let micTrack: IMicrophoneAudioTrack;
        let camTrack: ICameraVideoTrack;
        try {
          [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        } catch (err) {
          const message =
            err instanceof Error && /Permission|NotAllowed|Denied/i.test(err.message)
              ? "Camera or microphone permission denied."
              : err instanceof Error
                ? err.message
                : "Could not access camera/microphone";
          setError(message);
          return;
        }

        if (cancelled) {
          micTrack.close();
          camTrack.close();
          return;
        }

        localTracksRef.current = [micTrack, camTrack];
        setLocalVideo(camTrack);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not open room");
      }
    }

    void start();
    return () => {
      cancelled = true;
      void cleanup();
    };
  }, [slug, cleanup]);

  useEffect(() => {
    let cancelled = false;

    async function loadNames() {
      const [me, sessions] = await Promise.all([api.me(), api.roomSessions(slug)]);
      if (cancelled) return;
      setSelfName(me.name);
      const active = sessions.find((session) => session.ended_at === null) ?? sessions[0];
      const next: Record<string, string> = {};
      for (const person of active?.participants ?? []) {
        if (person.left_at || person.agora_uid == null) continue;
        next[String(person.agora_uid)] = person.name;
      }
      setNamesByUid(next);
    }

    void loadNames().catch(() => undefined);
    const namesTimer = window.setInterval(() => {
      void loadNames().catch(() => undefined);
    }, 5000);

    const timer = window.setInterval(() => {
      if (!joinedRef.current) return;
      void api.heartbeat(slug).catch(() => undefined);
    }, 30_000);

    const onHide = () => {
      const token = getToken();
      if (token && joinedRef.current && !leftRef.current) {
        leftRef.current = true;
        leaveRoomBeacon(slug, token);
      }
    };
    window.addEventListener("pagehide", onHide);

    return () => {
      cancelled = true;
      window.clearInterval(namesTimer);
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
    };
  }, [slug]);

  const dropClient = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    if (!client) return;
    client.removeAllListeners();
    try {
      await client.leave();
    } catch {
      /* already gone */
    }
    setRemotePeers([]);
  }, []);

  const enterCall = useCallback(async () => {
    if (joining || joinedRef.current) return;
    setJoining(true);
    setError(null);
    setCanRejoin(false);
    setStatus("Connecting…");
    try {
      await dropClient();
      const joined = await api.joinRoom(slug);
      setJoinInfo(joined);

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      const patchPeer = (uid: string | number, patch: Partial<RemotePeer>) => {
        setRemotePeers((prev) => {
          const existing = prev.find((peer) => peer.uid === uid);
          if (!existing) {
            return [...prev, { uid, track: null, micMuted: true, camOff: true, ...patch }];
          }
          return prev.map((peer) => (peer.uid === uid ? { ...peer, ...patch } : peer));
        });
      };

      client.on("user-joined", (user) => {
        patchPeer(user.uid, { track: null });
      });
      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") patchPeer(user.uid, { track: user.videoTrack ?? null, camOff: false });
        if (mediaType === "audio" && user.audioTrack) {
          user.audioTrack.play();
          patchPeer(user.uid, { micMuted: false });
        }
      });
      client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "video") patchPeer(user.uid, { track: null, camOff: true });
        if (mediaType === "audio") patchPeer(user.uid, { micMuted: true });
      });
      client.on("user-info-updated", (uid, msg) => {
        if (msg === "mute-audio") patchPeer(uid, { micMuted: true });
        if (msg === "unmute-audio") patchPeer(uid, { micMuted: false });
        if (msg === "mute-video") patchPeer(uid, { camOff: true });
        if (msg === "unmute-video") patchPeer(uid, { camOff: false });
      });
      client.on("user-left", (user) => {
        setRemotePeers((prev) => prev.filter((peer) => peer.uid !== user.uid));
      });
      client.on("connection-state-change", (cur, _prev, reason) => {
        if (cur === "DISCONNECTED" && reason === "UID_BANNED") {
          joinedRef.current = false;
          setInCall(false);
          setCanRejoin(true);
          setError(TAKEN_OVER);
          setStatus("Ready");
        }
      });

      await client.join(joined.app_id, joined.channel, joined.rtc_token, joined.uid);
      const tracks = localTracksRef.current;
      if (tracks) {
        const [micTrack, camTrack] = tracks;
        const toPublish = [];
        if (micOn) {
          await micTrack.setEnabled(true);
          toPublish.push(micTrack);
        } else {
          await micTrack.setEnabled(false);
        }
        if (camOn) {
          await camTrack.setEnabled(true);
          setLocalVideo(camTrack);
          toPublish.push(camTrack);
        } else {
          await camTrack.setEnabled(false);
          setLocalVideo(null);
        }
        if (toPublish.length > 0) await client.publish(toPublish);
      }
      joinedRef.current = true;
      setInCall(true);
      setStatus("Connected");
    } catch (err) {
      const raw = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Join failed";
      const disabled = /TRACK_IS_DISABLED/i.test(raw);
      if (isUidConflict(raw)) {
        joinedRef.current = false;
        setInCall(false);
        setCanRejoin(true);
        setError(TAKEN_OVER);
      } else {
        const message = disabled
          ? /track-mic/i.test(raw) || !micOn
            ? "The mic is disabled."
            : "The camera is disabled."
          : raw;
        setCanRejoin(false);
        setError(message);
      }
      setStatus("Ready");
    } finally {
      setJoining(false);
    }
  }, [camOn, dropClient, joining, micOn, slug]);

  const rejoin = useCallback(async () => {
    joinedRef.current = false;
    leftRef.current = false;
    setInCall(false);
    await dropClient();
    await enterCall();
  }, [dropClient, enterCall]);

  const toggleMic = useCallback(async () => {
    const tracks = localTracksRef.current;
    if (!tracks) return;
    const next = !micOn;
    const track = tracks[0];
    const client = clientRef.current;
    if (next) {
      await track.setEnabled(true);
      if (client && joinedRef.current && !client.localTracks.includes(track)) {
        await client.publish(track);
      }
    } else {
      await track.setEnabled(false);
    }
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const tracks = localTracksRef.current;
    if (!tracks) return;
    const next = !camOn;
    const track = tracks[1];
    const client = clientRef.current;
    if (next) {
      await track.setEnabled(true);
      setLocalVideo(track);
      if (client && joinedRef.current && !client.localTracks.includes(track)) {
        await client.publish(track);
      }
    } else {
      await track.setEnabled(false);
      setLocalVideo(null);
    }
    setCamOn(next);
  }, [camOn]);

  const leave = useCallback(async () => {
    await cleanup();
    router.push("/dashboard");
  }, [cleanup, router]);

  const tiles = useMemo(
    () => [
      {
        id: "local",
        label: selfName,
        track: localVideo,
        mirrored: true,
        micMuted: !micOn,
        camOff: !camOn,
      },
      ...remotePeers.map((peer) => ({
        id: String(peer.uid),
        label: namesByUid[String(peer.uid)] ?? "Guest",
        track: peer.track,
        micMuted: peer.micMuted,
        camOff: peer.camOff || peer.track == null,
      })),
    ],
    [camOn, localVideo, micOn, namesByUid, remotePeers, selfName],
  );

  if (!inCall) {
    return (
      <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative">
          <VideoGrid
            tiles={[
              {
                id: "local",
                label: selfName,
                track: localVideo,
                mirrored: true,
                micMuted: !micOn,
                camOff: !camOn,
              },
            ]}
          />
          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-3">
            <button
              type="button"
              onClick={() => void toggleMic()}
              className={`flex h-12 w-12 items-center justify-center rounded-full ${micOn ? "bg-black/60 text-white" : "bg-white text-black"}`}
              aria-label={micOn ? "Mute" : "Unmute"}
            >
              <Icon name={micOn ? "mic" : "mic_off"} filled={!micOn} />
            </button>
            <button
              type="button"
              onClick={() => void toggleCam()}
              className={`flex h-12 w-12 items-center justify-center rounded-full ${camOn ? "bg-black/60 text-white" : "bg-white text-black"}`}
              aria-label={camOn ? "Turn camera off" : "Turn camera on"}
            >
              <Icon name={camOn ? "videocam" : "videocam_off"} filled={!camOn} />
            </button>
          </div>
        </div>
        <aside className="text-white">
          <h1 className="text-3xl font-medium tracking-tight">Ready to join?</h1>
          <p className="mt-2 text-sm text-zinc-400">You&apos;re about to join the meeting.</p>
          <p className="mt-8 text-xs uppercase tracking-[0.16em] text-zinc-500">Meeting</p>
          <p className="mt-1 text-lg">{room?.title ?? slug}</p>
          <p className="text-sm text-zinc-500">{slug}</p>
          <p className="mt-6 text-xs uppercase tracking-[0.16em] text-zinc-500">Your name</p>
          <p className="mt-1 rounded-xl border border-white/10 bg-[#161616] px-4 py-3 text-sm">{selfName}</p>
          <ErrorCard message={error} className="mt-4" />
          <button
            type="button"
            onClick={() => void (canRejoin ? rejoin() : enterCall())}
            disabled={joining}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
          >
            {joining ? "Joining…" : canRejoin ? "Rejoin here" : "Join now"}
            <Icon name="arrow_forward" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-3 w-full py-2 text-sm text-zinc-400 hover:text-white"
          >
            Back
          </button>
        </aside>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col text-white">
      <header className="flex items-center justify-between py-4 pl-6 pr-16">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-zinc-600">/</span>
          <h1 className="text-sm text-zinc-200">{room?.title ?? slug}</h1>
        </div>
        <p className="flex items-center gap-2 text-sm text-zinc-300">
          <span className="h-2 w-2 rounded-full bg-white" />
          {status}
        </p>
      </header>

      <div className="flex flex-col items-center gap-3 px-6">
        <ErrorCard message={error} />
        {canRejoin ? (
          <button
            type="button"
            onClick={() => void rejoin()}
            disabled={joining}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
          >
            {joining ? "Joining…" : "Rejoin here"}
            <Icon name="arrow_forward" />
          </button>
        ) : null}
      </div>

      <div className={`grid min-h-0 flex-1 gap-4 px-6 pb-4 ${chatOpen ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <div className="flex items-center justify-center">
          <VideoGrid tiles={tiles} />
        </div>
        {chatOpen && joinInfo?.chat_room_id ? (
          <ChatPanel
            slug={slug}
            chatUser={joinInfo.chat_user}
            chatToken={joinInfo.chat_token}
            chatRoomId={joinInfo.chat_room_id}
          />
        ) : null}
        {chatOpen && joinInfo && !joinInfo.chat_room_id ? (
          <aside className="rounded-[28px] bg-[#141414] p-4 text-sm text-zinc-400">
            Chat is unavailable for this room.
          </aside>
        ) : null}
      </div>

      <div className="flex justify-center pb-6">
        <Controls
          micOn={micOn}
          camOn={camOn}
          chatOpen={chatOpen}
          onToggleMic={() => void toggleMic()}
          onToggleCam={() => void toggleCam()}
          onToggleChat={() => setChatOpen((open) => !open)}
          onLeave={() => void leave()}
        />
      </div>
    </main>
  );
}
