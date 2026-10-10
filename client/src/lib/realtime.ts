import { io, type Socket } from "socket.io-client";

export type RealtimeEvent = "auction:updated" | "results:updated";

let socket: Socket | null = null;

/**
 * Connects to an optional Socket.IO server when VITE_SOCKET_URL is present.
 * The static frontend remains fully usable without it; Firestore remains the
 * source of truth and local events keep preview queries responsive.
 */
export function connectRealtime(): () => void {
  const url = import.meta.env.VITE_SOCKET_URL as string | undefined;
  if (!url || typeof window === "undefined") return () => undefined;

  socket = io(url, { transports: ["websocket", "polling"], autoConnect: true });
  const forward = (event: RealtimeEvent) => window.dispatchEvent(new CustomEvent("cherta:realtime", { detail: { event } }));
  socket.on("auction:updated", () => forward("auction:updated"));
  socket.on("results:updated", () => forward("results:updated"));
  socket.on("connect_error", (error) => console.warn("Optional realtime connection unavailable:", error.message));

  return () => {
    socket?.disconnect();
    socket = null;
  };
}
