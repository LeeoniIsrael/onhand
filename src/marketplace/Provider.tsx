import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { AppState, Platform } from "react-native";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import * as Network from "expo-network";
import { supabase, subscribeToJob } from "../services/supabase";
import { clearLegacyStorage } from "../services/legacy-cleanup";
import { useRequestDraft } from "./draft";
import { marketplace } from "./api";
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
  error: string | null;
  recovering: boolean;
  finishRecovery: () => void;
}>({
  session: null,
  loading: true,
  error: null,
  recovering: false,
  finishRecovery: () => {},
});
export function MarketplaceProvider({ children }: React.PropsWithChildren) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15000,
            gcTime: 300000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  );
  const [auth, setAuth] = useState<{
    session: Session | null;
    loading: boolean;
    error: string | null;
    recovering: boolean;
  }>({
    session: null,
    loading: Boolean(supabase),
    error: null,
    recovering: false,
  });
  const actor = useRef<string | null>(null);
  useEffect(() => {
    void clearLegacyStorage().catch(() => {});
    if (!supabase) return;
    const db = supabase;
    let mounted = true;
    const update = (session: Session | null, event: string) => {
      if (!mounted) return;
      if (actor.current !== session?.user.id) {
        client.clear();
        useRequestDraft.getState().reset();
        actor.current = session?.user.id ?? null;
      }
      setAuth((previous) => ({
        session,
        loading: false,
        error: null,
        recovering:
          event === "PASSWORD_RECOVERY"
            ? true
            : session
              ? previous.recovering
              : false,
      }));
    };
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event, session) => update(session, event));
    const state = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        db.auth.startAutoRefresh();
        focusManager.setFocused(true);
      } else {
        db.auth.stopAutoRefresh();
        focusManager.setFocused(false);
      }
    });
    if (AppState.currentState === "active") db.auth.startAutoRefresh();
    const network = Network.addNetworkStateListener((s) =>
      onlineManager.setOnline(
        Boolean(s.isConnected && s.isInternetReachable !== false),
      ),
    );
    void Network.getNetworkStateAsync()
      .then((s) =>
        onlineManager.setOnline(
          Boolean(s.isConnected && s.isInternetReachable !== false),
        ),
      )
      .catch(() => {});
    return () => {
      mounted = false;
      subscription.unsubscribe();
      state.remove();
      network.remove();
      db.auth.stopAutoRefresh();
      client.clear();
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{
          ...auth,
          finishRecovery: () =>
            setAuth((previous) => ({ ...previous, recovering: false })),
        }}
      >
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function useHome(options?: { poll?: boolean }) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["home", session?.user.id],
    queryFn: () => marketplace.home(),
    enabled: Boolean(session),
    refetchInterval: options?.poll ? 30000 : false,
  });
}
export function useJob(id: string) {
  const { session } = useAuth();
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  const query = useQuery({
    queryKey: ["job", session?.user.id, id],
    queryFn: () => marketplace.job(id),
    enabled: Boolean(session && id),
    refetchInterval: connected ? 20000 : 5000,
  });
  useEffect(() => {
    if (!session || !id) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToJob(
      id,
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void client.invalidateQueries({
            queryKey: ["job", session.user.id, id],
          });
          void client.invalidateQueries({
            queryKey: ["home", session.user.id],
          });
        }, 100);
      },
      setConnected,
    );
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [id, session, client]);
  return { ...query, connected };
}
export function useRealtimeHome() {
  const { session } = useAuth();
  const client = useQueryClient();
  useEffect(() => {
    if (!session || !supabase) return;
    const db = supabase;
    void clearLegacyStorage().catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          void client.invalidateQueries({
            queryKey: ["home", session.user.id],
          }),
        180,
      );
    };
    const channel = db
      .channel(`account:${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_offers",
          filter: `worker_id=eq.${session.user.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
          filter: `customer_id=eq.${session.user.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
          filter: `worker_id=eq.${session.user.id}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [session, client]);
}
export const nativePlatform = Platform.OS !== "web";
