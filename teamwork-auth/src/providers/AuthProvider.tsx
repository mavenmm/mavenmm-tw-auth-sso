import { useEffect, createContext, useContext, useRef, useState } from "react";
import { Login } from "../components/Login";
import { useTeamworkAuth, type TeamworkAuthConfig } from "../hooks/useTeamworkAuth";
import type { User, AuthContextType } from "../types";

export const AuthContext = createContext({} as AuthContextType);

// Hook to use the auth context
export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}

export interface AuthProviderProps {
  children: React.ReactNode;
  authConfig: TeamworkAuthConfig;
}

export default function AuthProvider({
  children,
  authConfig,
}: AuthProviderProps) {
  const { user, setUser, logout, loading, isAuthenticated, login, getAccessToken } =
    useTeamworkAuth(authConfig);

  // Get the code from the URL for the teamwork login flow (framework-agnostic)
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    // Read OAuth code from URL on mount (works with any framework)
    const params = new URLSearchParams(window.location.search);

    // Skip QuickBooks OAuth callbacks (identified by realmId parameter)
    // QuickBooks uses realmId to identify the company - Teamwork OAuth doesn't use this
    const isQuickBooksCallback = params.has('realmId');
    if (isQuickBooksCallback) {
      setCode(null);
      return;
    }

    setCode(params.get("code"));
  }, []);

  const value = { user, logout, loading, isAuthenticated, getAccessToken };

  // Use refs to prevent infinite loops
  const lastCodeRef = useRef<string | null>(null);

  // Handle OAuth callback code
  useEffect(() => {
    // Skip if still loading
    if (loading) return;

    const usedCode = localStorage.getItem("prevCode");

    const handleLogin = async (code: string) => {
      try {
        const result = await login(code);
      } catch (err: any) {
        // Handle login error silently or with user-facing error handling
      }
    };

    // Process OAuth callback code if present
    if (code && !user) {
      // React.StrictMode is causing this provider to render twice on load, teamwork will return an error on the second login call
      // Add a prevCode check here to make sure we don't double request /api/login with the same code
      if (usedCode !== code && lastCodeRef.current !== code) {
        lastCodeRef.current = code;
        handleLogin(code);
      }
    }
  }, [code, user, loading, login]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
