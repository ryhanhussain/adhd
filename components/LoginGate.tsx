"use client";

import { useAuth } from "@/components/AuthProvider";
import LoginModal from "@/components/LoginModal";

export default function LoginGate() {
  const { user, loading } = useAuth();

  if (loading || user) return null;

  return <LoginModal />;
}
