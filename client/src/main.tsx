import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { connectRealtime } from "./lib/realtime";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true, refetchInterval: 15_000, refetchIntervalInBackground: true },
  },
});

const stopRealtime = connectRealtime();
if (typeof window !== "undefined") {
  window.addEventListener("cherta:realtime", () => {
    void queryClient.invalidateQueries({ queryKey: ["firestore-auctions"] });
    void queryClient.invalidateQueries({ queryKey: ["firestore-results"] });
  });
  window.addEventListener("beforeunload", stopRealtime, { once: true });
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
