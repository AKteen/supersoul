"use client";

import AgoraChat from "agora-chat";

import { Icon } from "@/components/Icon";
import { FormEvent, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

export type ChatMessage = {
  id: string;
  from: string;
  text: string;
  self: boolean;
  time: number;
};

type ChatPanelProps = {
  slug: string;
  chatUser: string;
  chatToken: string;
  chatRoomId: string;
  names?: Record<string, string>;
};

function displayName(userId: string, names: Record<string, string>): string {
  const name = names[userId];
  if (name) return name;
  return userId.length > 8 ? `${userId.slice(0, 6)}…` : userId;
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Failed to connect";
}

let activeClose: (() => Promise<void>) | null = null;

async function takeOver(close: () => Promise<void>) {
  const previous = activeClose;
  activeClose = close;
  if (previous && previous !== close) {
    try {
      await previous();
    } catch {
      /* the previous login is already gone */
    }
  }
}

export function ChatPanel({ slug, chatUser, chatToken, chatRoomId, names = {} }: ChatPanelProps) {
  const connRef = useRef<InstanceType<typeof AgoraChat.connection> | null>(null);
  const chatReadyRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [ready, setReady] = useState(false);

  const appKey = process.env.NEXT_PUBLIC_AGORA_CHAT_APP_KEY ?? "";

  useEffect(() => {
    if (!appKey) {
      setPhase("failed");
      return;
    }

    let cancelled = false;
    let closing = false;
    let kicks = 0;
    const handlerId = `room-chat-${chatRoomId}`;
    const conn = new AgoraChat.connection({
      appKey,
      autoReconnectNumMax: 0,
      isFixedDeviceId: true,
    });
    connRef.current = conn;

    const close = async () => {
      closing = true;
      try {
        await conn.leaveChatRoom({ roomId: chatRoomId });
      } catch {
        /* ignore */
      }
      try {
        conn.close();
      } catch {
        /* ignore */
      }
      if (activeClose === close) activeClose = null;
    };

    const pushMessage = (msg: { id?: string; from?: string; msg?: string; time?: number }) => {
      const text = msg.msg ?? "";
      if (!text) return;
      const from = msg.from ?? "unknown";
      setMessages((prev) => {
        const id = String(msg.id ?? `${from}-${msg.time ?? Date.now()}-${text}`);
        if (prev.some((m) => m.id === id)) return prev;
        return [
          ...prev,
          {
            id,
            from,
            text,
            self: from === chatUser,
            time: msg.time ?? Date.now(),
          },
        ];
      });
    };

    const renew = async () => {
      try {
        const joined = await api.joinRoom(slug);
        await conn.renewToken(joined.chat_token);
      } catch (err) {
        console.warn("Chat token renew failed", errorText(err));
        if (!cancelled) {
          chatReadyRef.current = false;
          setReady(false);
          setPhase("failed");
        }
      }
    };

    const loginWaiters: Array<() => void> = [];
    const waitForLogin = () =>
      new Promise<void>((resolve) => {
        if (conn.isOpened()) {
          resolve();
          return;
        }
        loginWaiters.push(resolve);
      });

    conn.addEventHandler(handlerId, {
      onConnected: () => {
        loginWaiters.splice(0).forEach((resolve) => resolve());
      },
      onDisconnected: () => {
        if (cancelled || closing || !chatReadyRef.current) return;
        chatReadyRef.current = false;
        setReady(false);
        kicks += 1;
        if (kicks > 1) {
          setPhase("failed");
          return;
        }
        setPhase("loading");
        void start();
      },
      onTextMessage: (message) => {
        if (message.chatType === "chatRoom" && message.to === chatRoomId) {
          pushMessage(message);
        } else if (message.chatType === "chatRoom") {
          // Join-history payloads may omit exact to matching in some SDK versions.
          pushMessage(message);
        }
      },
      onTokenWillExpire: () => {
        void renew();
      },
      onTokenExpired: () => {
        void renew();
      },
      onError: (err) => {
        console.warn("Chat connection error", errorText(err));
      },
    });

    async function start() {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
        try {
          await takeOver(close);
          if (cancelled) return;

          const opened = conn.open({
            user: chatUser,
            accessToken: chatToken,
          });
          await Promise.race([
            Promise.all([opened, waitForLogin()]),
            new Promise((_, reject) => {
              window.setTimeout(() => reject(new Error("timeout")), 12000);
            }),
          ]);
          if (cancelled) return;

          await conn.joinChatRoom({ roomId: chatRoomId });
          if (cancelled) return;
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          console.warn("Chat login attempt failed", errorText(err));
          try {
            conn.close();
          } catch {
            /* ignore */
          }
          if (attempt < 2 && !cancelled) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
          }
        }
      }

      if (cancelled) return;
      if (lastError) {
        console.warn("Chat failed to connect", errorText(lastError));
        chatReadyRef.current = false;
        setReady(false);
        setPhase("failed");
        return;
      }

      try {
        const history = await conn.getHistoryMessages({
          targetId: chatRoomId,
          chatType: "chatRoom",
          pageSize: 20,
          searchDirection: "up",
        });
        const list = (history?.messages ?? []) as Array<{
          id?: string;
          from?: string;
          msg?: string;
          time?: number;
          type?: string;
        }>;
        for (const item of [...list].reverse()) {
          if (item.type === "txt" || item.msg) pushMessage(item);
        }
      } catch {
        // History may be disabled for chatrooms until enabled in Console;
        // join still delivers recent messages via onTextMessage.
      }

      if (!cancelled) {
        chatReadyRef.current = true;
        setReady(true);
        setPhase("ready");
      }
    }

    void start();

    return () => {
      cancelled = true;
      closing = true;
      chatReadyRef.current = false;
      try {
        conn.removeEventHandler(handlerId);
      } catch {
        /* ignore */
      }
      void close();
      connRef.current = null;
    };
  }, [appKey, chatRoomId, chatToken, chatUser, slug]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    const conn = connRef.current;
    if (!text || !conn || !ready) return;

    const msg = AgoraChat.message.create({
      type: "txt",
      chatType: "chatRoom",
      to: chatRoomId,
      msg: text,
    });

    try {
      await conn.send(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          from: chatUser,
          text,
          self: true,
          time: Date.now(),
        },
      ]);
      setDraft("");
    } catch (err) {
      console.warn("Chat send failed", errorText(err));
    }
  }

  return (
    <aside className="flex h-full min-h-[280px] w-full flex-col overflow-hidden rounded-[28px] bg-[#141414]">
      <div className="px-4 py-4">
        <p className="text-base font-medium text-white">In-call messages</p>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {phase !== "ready" ? (
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            {phase === "failed" ? <span>Failed to connect</span> : null}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-zinc-500">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2a2a2a] text-[11px] text-white">
                {(m.self ? "Y" : displayName(m.from, names).slice(0, 1)).toUpperCase()}
              </span>
              <div>
                <p className="text-xs text-zinc-500">{m.self ? "You" : displayName(m.from, names)}</p>
                <p className="mt-0.5 text-white">{m.text}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={(e) => void onSend(e)} className="flex gap-2 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!ready}
          placeholder={ready ? "Send a message" : "Connecting…"}
          className="flex-1 rounded-full bg-[#1c1c1c] px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-500 disabled:opacity-50"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!ready || !draft.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
        >
          <Icon name="send" filled />
        </button>
      </form>
    </aside>
  );
}
