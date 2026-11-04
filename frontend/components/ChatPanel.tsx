"use client";

import AgoraChat from "agora-chat";
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
};

function shortName(userId: string): string {
  return userId.length > 8 ? `${userId.slice(0, 6)}…` : userId;
}

export function ChatPanel({ slug, chatUser, chatToken, chatRoomId }: ChatPanelProps) {
  const connRef = useRef<InstanceType<typeof AgoraChat.connection> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Connecting chat…");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const appKey = process.env.NEXT_PUBLIC_AGORA_CHAT_APP_KEY ?? "";

  useEffect(() => {
    if (!appKey) {
      setError("NEXT_PUBLIC_AGORA_CHAT_APP_KEY is not set");
      setStatus("Chat unavailable");
      return;
    }

    let cancelled = false;
    const handlerId = `room-chat-${chatRoomId}`;
    const conn = new AgoraChat.connection({
      appKey,
      autoReconnectNumMax: 5,
    });
    connRef.current = conn;

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
        setStatus("Chat connected");
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Token renew failed");
        setStatus("Chat reconnecting…");
      }
    };

    conn.addEventHandler(handlerId, {
      onConnected: () => {
        if (!cancelled) setStatus("Chat connected");
      },
      onDisconnected: () => {
        if (!cancelled) {
          setReady(false);
          setStatus("Chat disconnected");
        }
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
        if (!cancelled) {
          setError(typeof err?.message === "string" ? err.message : "Chat error");
        }
      },
    });

    async function start() {
      try {
        await conn.open({
          user: chatUser,
          accessToken: chatToken,
        });
        if (cancelled) return;

        await conn.joinChatRoom({ roomId: chatRoomId });
        if (cancelled) return;

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
          setReady(true);
          setStatus("Chat connected");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to connect chat");
          setStatus("Chat failed");
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      try {
        conn.removeEventHandler(handlerId);
      } catch {
        /* ignore */
      }
      void (async () => {
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
      })();
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
      setError(err instanceof Error ? err.message : "Send failed");
    }
  }

  return (
    <aside className="flex h-full min-h-[280px] w-full flex-col rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <p className="text-sm font-medium">Live chat</p>
        <p className="text-xs text-zinc-500">{status}</p>
      </div>

      {error ? (
        <p className="px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {messages.length === 0 ? (
          <p className="text-zinc-500">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.self ? "text-right" : "text-left"}>
              <p className="text-[11px] text-zinc-500">
                {m.self ? "You" : shortName(m.from)}
              </p>
              <p
                className={`inline-block rounded px-2 py-1 ${
                  m.self
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 dark:bg-zinc-800"
                }`}
              >
                {m.text}
              </p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={(e) => void onSend(e)} className="flex gap-2 border-t border-zinc-200 p-2 dark:border-zinc-800">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!ready}
          placeholder={ready ? "Type a message" : "Connecting…"}
          className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:focus:border-zinc-200"
        />
        <button
          type="submit"
          disabled={!ready || !draft.trim()}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
