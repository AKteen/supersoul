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
import { VideoGrid } from "@/components/VideoGrid";
import { ApiError, JoinPayload, Room, api, leaveRoomBeacon } from "@/lib/api";
import { getToken } from "@/lib/auth";

type RemoteVideo = {
  uid: string | number;
  track: IRemoteVideoTrack;
};

type RoomCallProps = {
  slug: string;
};

export default function RoomCall({ slug }: RoomCallProps) {
  const router = useRouter();
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTracksRef = useRef<[IMicrophoneAudioTrack, ICameraVideoTrack] | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [joinInfo, setJoinInfo] = useState<JoinPayload | null>(null);
  const [localVideo, setLocalVideo] = useState<ICameraVideoTrack | null>(null);
  const [remoteVideos, setRemoteVideos] = useState<RemoteVideo[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState<string | null>(null);

  const leftRef = useRef(false);

  const notifyLeave = useCallback(async () => {
    if (leftRef.current) return;
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
    setRemoteVideos([]);
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

        const joined = await api.joinRoom(slug);
        if (cancelled) return;
        setJoinInfo(joined);

        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        clientRef.current = client;

        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "video" && user.videoTrack) {
            setRemoteVideos((prev) => {
              const without = prev.filter((r) => r.uid !== user.uid);
              return [...without, { uid: user.uid, track: user.videoTrack! }];
            });
          }
          if (mediaType === "audio" && user.audioTrack) {
            user.audioTrack.play();
          }
        });

        client.on("user-unpublished", (user, mediaType) => {
          if (mediaType === "video") {
            setRemoteVideos((prev) => prev.filter((r) => r.uid !== user.uid));
          }
        });

        client.on("user-left", (user) => {
          setRemoteVideos((prev) => prev.filter((r) => r.uid !== user.uid));
        });

        await client.join(joined.app_id, joined.channel, joined.rtc_token, joined.uid);

        let micTrack: IMicrophoneAudioTrack;
        let camTrack: ICameraVideoTrack;
        try {
          [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        } catch (err) {
          const message =
            err instanceof Error && /Permission|NotAllowed|Denied/i.test(err.message)
              ? "Camera or microphone permission denied. Allow access and reload."
              : err instanceof Error
                ? err.message
                : "Could not access camera/microphone";
          setError(message);
          setStatus("Permission error");
          return;
        }

        if (cancelled) {
          micTrack.close();
          camTrack.close();
          return;
        }

        localTracksRef.current = [micTrack, camTrack];
        setLocalVideo(camTrack);
        await client.publish([micTrack, camTrack]);
        setStatus("In call");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Join failed");
        setStatus("Failed");
      }
    }

    void start();
    return () => {
      cancelled = true;
      void cleanup();
    };
  }, [slug, cleanup]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void api.heartbeat(slug).catch(() => undefined);
    }, 30_000);

    const onHide = () => {
      const token = getToken();
      if (token && !leftRef.current) {
        leftRef.current = true;
        leaveRoomBeacon(slug, token);
      }
    };
    window.addEventListener("pagehide", onHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
    };
  }, [slug]);

  const toggleMic = useCallback(async () => {
    const tracks = localTracksRef.current;
    if (!tracks) return;
    const next = !micOn;
    await tracks[0].setEnabled(next);
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const tracks = localTracksRef.current;
    if (!tracks) return;
    const next = !camOn;
    await tracks[1].setEnabled(next);
    setCamOn(next);
    setLocalVideo(next ? tracks[1] : null);
  }, [camOn]);

  const leave = useCallback(async () => {
    await cleanup();
    router.push("/dashboard");
  }, [cleanup, router]);

  const tiles = useMemo(
    () => [
      {
        id: "local",
        label: "You",
        track: localVideo,
        mirrored: true,
      },
      ...remoteVideos.map((r) => ({
        id: String(r.uid),
        label: `User ${r.uid}`,
        track: r.track,
      })),
    ],
    [localVideo, remoteVideos],
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">SuperSoul</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {room?.title ?? slug}
          </h1>
          <p className="text-sm text-zinc-500">
            {status}
            {joinInfo ? ` · uid ${joinInfo.uid}` : ""}
          </p>
        </div>
      </header>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <VideoGrid tiles={tiles} />
          <Controls
            micOn={micOn}
            camOn={camOn}
            onToggleMic={() => void toggleMic()}
            onToggleCam={() => void toggleCam()}
            onLeave={() => void leave()}
          />
        </div>
        {joinInfo?.chat_room_id ? (
          <ChatPanel
            slug={slug}
            chatUser={joinInfo.chat_user}
            chatToken={joinInfo.chat_token}
            chatRoomId={joinInfo.chat_room_id}
          />
        ) : (
          <aside className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
            Chat unavailable — room has no Agora chat room id. Enable Chat in Console and set
            AGORA_CHAT_* env vars.
          </aside>
        )}
      </div>
    </main>
  );
}
