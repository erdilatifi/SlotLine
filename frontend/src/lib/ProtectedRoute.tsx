import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { accessToken, loading } = useAuth();
  if (loading) return null;
  if (!accessToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
