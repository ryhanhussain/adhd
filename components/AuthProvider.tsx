"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  handleIntentionsSignOut,
  startIntentionsSync,
  stopIntentionsSync,
} from "@/lib/intentionsSync";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks the user id the sync listeners are currently wired for so we only
  // restart the listeners when the signed-in identity actually changes.
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Keep the intentions sync lifecycle aligned with the auth state.
  // The sync module itself handles owner-mismatch detection (clears local
  // data if a different account signs in on this device), so we only need
  // to start/stop listeners here.
  useEffect(() => {
    const nextId = user?.id ?? null;
    if (nextId === syncedUserId.current) return;

    if (nextId) {
      startIntentionsSync();
    } else {
      stopIntentionsSync();
      void handleIntentionsSignOut();
    }
    syncedUserId.current = nextId;
  }, [user?.id]);

  useEffect(() => {
    return () => {
      stopIntentionsSync();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  if (loading) return null;

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
