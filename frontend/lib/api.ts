import { clearToken, getToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401 && auth) {
    clearToken();
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = (await res.json()) as { detail?: string | { msg: string }[] };
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail)) detail = data.detail.map((d) => d.msg).join(", ");
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type TokenResponse = { access_token: string; token_type: string };
export type User = {
  id: string;
  email: string;
  name: string;
  agora_uid: number;
  created_at: string;
};
export type Room = {
  id: string;
  slug: string;
  title: string;
  host_id: string;
  max_participants: number;
  chat_room_id: string | null;
  is_active: boolean;
  created_at: string;
  share_path: string;
};

export const api = {
  signup: (body: { email: string; password: string; name: string }) =>
    request<TokenResponse>("/auth/signup", { method: "POST", body: JSON.stringify(body) }, false),
  login: (body: { email: string; password: string }) =>
    request<TokenResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }, false),
  me: () => request<User>("/auth/me"),
  createRoom: (body: { title: string; max_participants?: number }) =>
    request<Room>("/rooms", { method: "POST", body: JSON.stringify(body) }),
  myRooms: () => request<Room[]>("/rooms/mine"),
  getRoom: (slug: string) => request<Room>(`/rooms/${slug}`, {}, false),
};
