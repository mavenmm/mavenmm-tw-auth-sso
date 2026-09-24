import { useState, useEffect, useRef, useCallback } from "react";
import type { AccessDenied, User } from "../types";
import { domainKeyFromBuildEnv } from "../utils/buildEnv";

export interface TeamworkAuthConfig {
  authServiceUrl?: string; // Optional - auto-detects if not provided
  domainKey?: string;      // Optional - domain authentication key (required for production)
}

/**
 * Auto-detect the auth service URL based on environment
 *
 * The auth service is hosted on the maven-dashboard server (Digital Ocean droplet)
 * and proxied through auth.mavenmm.com via Nginx. The service provides:
 * - JWT-based authentication with dual-token strategy
 * - Redis-backed session persistence and token blacklisting
 * - Cross-domain SSO for all *.mavenmm.com applications
 */
function detectAuthServiceUrl(): string {
  const hostname = window.location.hostname;

  // Production: *.mavenmm.com domains use centralized auth service
  // Auth service is hosted on maven-dashboard server, proxied via auth.mavenmm.com
  if (hostname.endsWith('.mavenmm.com') || hostname === 'mavenmm.com') {
    return 'https://auth.mavenmm.com';
  }

  // Staging: *.netlify.app domains also use production auth service
  if (hostname.endsWith('.netlify.app')) {
    return 'https://auth.mavenmm.com';
  }

  // Development: localhost uses local dashboard server on port 4000
  // Run `yarn start` in maven-dashboard/server to start the auth service locally
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:4000';
  }

  // Fallback for unknown environments
  console.warn(
    `TeamworkAuth: Unknown hostname "${hostname}". Defaulting to localhost:4000. ` +
    'Please provide authServiceUrl explicitly if this is incorrect.'
  );
  return 'http://localhost:4000';
}

/**
 * Get domain key from environment or config
 */
function getDomainKey(config?: string): string | undefined {
  // Priority: explicit config > environment variable
  if (config) return config;
  return domainKeyFromBuildEnv();
}

/**
 * Get common headers for auth requests
 */
function getAuthHeaders(domainKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (domainKey) {
    headers["X-Domain-Key"] = domainKey;
  }

  return headers;
}

const DEFAULT_REFUSAL: AccessDenied = {
  code: "access_denied",
  message: "Your account doesn't have access to this app. Ask an admin if you believe this is wrong.",
};

/**
 * Read the auth service's refusal from a 403 response: `{ error, code, message }`,
 * where `message` is written for the person. Falls back to a generic line when
 * the body carries none. Never log the message: it can contain the person's email.
 */
async function readRefusal(response: Response): Promise<AccessDenied> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const { code, message } = body as Record<string, unknown>;
      if (typeof message === "string" && message.length > 0) {
        return { code: typeof code === "string" && code ? code : DEFAULT_REFUSAL.code, message };
      }
    }
  } catch {
    // Not JSON: fall through to the generic refusal.
  }
  return DEFAULT_REFUSAL;
}

/** Thrown by login() when the auth service refuses the person; `message` is the reason. */
export class AccessDeniedError extends Error {
  code: string;
  constructor(refusal: AccessDenied) {
    super(refusal.message);
    this.name = "AccessDeniedError";
    this.code = refusal.code;
  }
}

/**
 * Validate that user data has required fields
 */
function isValidUserData(user: unknown): user is User {
  if (!user || typeof user !== 'object') return false;
  const u = user as Record<string, unknown>;
  // id can be string or number depending on API response
  const hasValidId = typeof u.id === 'string' || typeof u.id === 'number';
  return (
    hasValidId &&
    typeof u.firstName === 'string' &&
    typeof u.lastName === 'string' &&
    typeof u.email === 'string' &&
    u.firstName.length > 0 &&
    u.email.length > 0
  );
}

export function useTeamworkAuth(config: TeamworkAuthConfig = {}) {
  // Auto-detect auth service URL if not provided
  const authServiceUrl = config.authServiceUrl || detectAuthServiceUrl();
  const domainKey = getDomainKey(config.domainKey);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Why the auth service refused this person (403 at login, refresh or checkAuth).
  const [accessDenied, setAccessDenied] = useState<AccessDenied | null>(null);

  // Access token management (stored in memory, NOT localStorage for security)
  const accessTokenRef = useRef<string | null>(null);
  const tokenExpiryRef = useRef<number>(0);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refreshInProgressRef = useRef<Promise<void> | null>(null);

  /**
   * Store access token and schedule refresh
   */
  const storeAccessToken = useCallback((token: string, expiresIn: number) => {
    accessTokenRef.current = token;
    const expiryTime = Date.now() + (expiresIn * 1000);
    tokenExpiryRef.current = expiryTime;

    // Clear existing refresh timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    // Schedule token refresh 1 minute before expiry
    const refreshTime = Math.max((expiresIn - 60) * 1000, 0);
    refreshTimerRef.current = setTimeout(() => {
      refreshToken();
    }, refreshTime);

  }, []);

  /**
   * Clear access token and cancel refresh timer
   */
  const clearAccessToken = useCallback(() => {
    accessTokenRef.current = null;
    tokenExpiryRef.current = 0;

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  /**
   * Refresh access token using refresh token (httpOnly cookie)
   */
  const refreshToken = useCallback(async () => {
    // If a refresh is already in progress, wait for it
    if (refreshInProgressRef.current) {
      return refreshInProgressRef.current;
    }

    // Start new refresh
    const refreshPromise = (async () => {
      try {
        const response = await fetch(`${authServiceUrl}/auth/refresh`, {
          method: "POST",
          headers: getAuthHeaders(domainKey),
          credentials: "include", // Send httpOnly cookie
        });

        if (!response.ok) {
          // 403 = the session is valid but this person may no longer use the app
          // (the auth service re-checks access on refresh). 401 = simply no session.
          if (response.status === 403) {
            setAccessDenied(await readRefusal(response));
          }
          throw new Error(`Token refresh failed: ${response.status}`);
        }

        const data = await response.json();

        // Store new access token
        storeAccessToken(data.accessToken, data.expiresIn);
        // Allowed again (e.g. access was granted since the last refusal).
        setAccessDenied(null);
      } catch (err) {
        console.error('Token refresh failed:', err);
        // Clear auth state on refresh failure
        clearAccessToken();
        setIsAuthenticated(false);
        setUser(null);
        localStorage.removeItem("maven_sso_user");
      } finally {
        // Clear the in-progress flag
        refreshInProgressRef.current = null;
      }
    })();

    refreshInProgressRef.current = refreshPromise;
    return refreshPromise;
  }, [authServiceUrl, domainKey, storeAccessToken, clearAccessToken]);

  /**
   * Login with OAuth code
   */
  const login = async (code: string) => {
    // Prevent code reuse (OAuth codes are single-use)
    const previousCode = localStorage.getItem("maven_sso_code");
    if (previousCode === JSON.stringify(code)) {
      return { user: null };
    }

    try {
      // Record the code BEFORE making the request to prevent race conditions
      localStorage.setItem("maven_sso_code", JSON.stringify(code));

      const options = {
        method: "POST",
        headers: {
          ...getAuthHeaders(domainKey),
          "code": code,
        },
        credentials: "include" as RequestCredentials,
      };

      const res = await fetch(`${authServiceUrl}/auth/login`, options);

      if (!res.ok) {
        if (res.status === 403) {
          // Refused by the access rule. Keep the reason for the login screen, and
          // drop the code from the URL: it is single-use, so a reload would only
          // fail again.
          const refusal = await readRefusal(res);
          setAccessDenied(refusal);
          cleanUpUrl();
          throw new AccessDeniedError(refusal);
        }
        throw new Error(`Login failed with status: ${res.status}`);
      }

      const data = await res.json();

      // Store access token
      storeAccessToken(data.accessToken, data.expiresIn);

      // Validate and store user data
      if (!isValidUserData(data.user)) {
        throw new Error("Login returned incomplete user data");
      }
      setUser(data.user);
      setIsAuthenticated(true);
      setAccessDenied(null);
      setLoading(false);
      localStorage.setItem("maven_sso_user", JSON.stringify(data.user));

      // Clean up URL
      cleanUpUrl();

      return { user: data.user };
    } catch (err) {
      // Clear the code on error so it can be retried
      localStorage.removeItem("maven_sso_code");
      setLoading(false);
      // A refusal carries its reason; anything else stays generic.
      if (err instanceof AccessDeniedError) throw err;
      throw new Error("Failed to log in");
    }
  };

  /**
   * Fetch user data from auth service
   */
  const fetchUserData = useCallback(async (): Promise<User | null> => {
    if (!accessTokenRef.current) {
      return null;
    }

    try {
      const response = await fetch(`${authServiceUrl}/auth/user`, {
        method: "GET",
        headers: {
          ...getAuthHeaders(domainKey),
          "Authorization": `Bearer ${accessTokenRef.current}`,
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (isValidUserData(data.user)) {
          // Store fresh user data
          setUser(data.user);
          localStorage.setItem("maven_sso_user", JSON.stringify(data.user));
          return data.user;
        } else if (data.user) {
          console.warn('Received incomplete user data from server');
        }
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error);
    }

    return null;
  }, [authServiceUrl, domainKey]);

  /**
   * Check authentication status
   */
  const checkAuth = useCallback(async () => {
    try {
      // If we have a valid access token, use it
      if (accessTokenRef.current && tokenExpiryRef.current > Date.now()) {
        const response = await fetch(`${authServiceUrl}/auth/checkAuth`, {
          method: "GET",
          headers: {
            ...getAuthHeaders(domainKey),
            "Authorization": `Bearer ${accessTokenRef.current}`,
          },
          credentials: "include",
        });

        if (response.status === 403) {
          setAccessDenied(await readRefusal(response));
        }

        if (response.ok) {
          const data = await response.json();

          if (data.authenticated === true) {
            setIsAuthenticated(true);
            cleanUpUrl();

            // Try to restore user data from localStorage first
            const prevUser = localStorage.getItem("maven_sso_user");
            let restoredFromCache = false;
            if (prevUser) {
              try {
                const userData = JSON.parse(prevUser);
                if (isValidUserData(userData)) {
                  setUser(userData);
                  restoredFromCache = true;
                } else {
                  // Invalid/incomplete user data in localStorage, clear it
                  localStorage.removeItem("maven_sso_user");
                }
              } catch (error) {
                console.error('Failed to parse user data:', error);
                localStorage.removeItem("maven_sso_user");
              }
            }

            // If no valid user data in localStorage, fetch from server
            if (!restoredFromCache) {
              await fetchUserData();
            }

            return;
          }
        }
      }

      // No valid access token - try to refresh
      await refreshToken();

      // After refresh, check again
      if (accessTokenRef.current) {
        const response = await fetch(`${authServiceUrl}/auth/checkAuth`, {
          method: "GET",
          headers: {
            ...getAuthHeaders(domainKey),
            "Authorization": `Bearer ${accessTokenRef.current}`,
          },
          credentials: "include",
        });

        if (response.status === 403) {
          setAccessDenied(await readRefusal(response));
        }

        if (response.ok) {
          const data = await response.json();

          if (data.authenticated === true) {
            setIsAuthenticated(true);
            cleanUpUrl();

            // Try to restore user data from localStorage first
            const prevUser = localStorage.getItem("maven_sso_user");
            let restoredFromCache = false;
            if (prevUser) {
              try {
                const userData = JSON.parse(prevUser);
                if (isValidUserData(userData)) {
                  setUser(userData);
                  restoredFromCache = true;
                } else {
                  // Invalid/incomplete user data in localStorage, clear it
                  localStorage.removeItem("maven_sso_user");
                }
              } catch (error) {
                console.error('Failed to parse user data:', error);
                localStorage.removeItem("maven_sso_user");
              }
            }

            // If no valid user data in localStorage, fetch from server
            if (!restoredFromCache) {
              await fetchUserData();
            }

            return;
          }
        }
      }

      // Not authenticated
      setIsAuthenticated(false);
      setUser(null);
      clearAccessToken();
      localStorage.removeItem("maven_sso_user");

    } catch (err) {
      setIsAuthenticated(false);
      setUser(null);
      clearAccessToken();
      localStorage.removeItem("maven_sso_user");

      // Check if this is a connection error
      const isConnectionError = err instanceof TypeError && err.message.includes('fetch');

      if (isConnectionError && authServiceUrl.includes('localhost:4000')) {
        const errorMessage =
          '⚠️ Auth service not running on localhost:4000\n\n' +
          'To start the auth service:\n' +
          '  cd maven-dashboard/server\n' +
          '  yarn start\n\n' +
          'Or provide a custom authServiceUrl in the config.';

        setError(errorMessage);
        console.error(errorMessage);
      } else if (isConnectionError) {
        const errorMessage = `⚠️ Cannot connect to auth service at ${authServiceUrl}`;
        setError(errorMessage);
        console.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [authServiceUrl, domainKey, refreshToken, clearAccessToken, storeAccessToken]);

  /**
   * Clean up URL parameters after OAuth
   */
  const cleanUpUrl = () => {
    try {
      const url = new URL(window.location.href);

      // Skip cleanup if this is a QuickBooks OAuth callback (has realmId parameter)
      // QuickBooks needs the code/state params for its own callback handling
      if (url.searchParams.has('realmId')) {
        return;
      }

      const oauthParams = ['code', 'state', 'client_id', 'redirect_uri', 'scope', 'response_type'];
      let hasOAuthParams = false;

      oauthParams.forEach(param => {
        if (url.searchParams.has(param)) {
          hasOAuthParams = true;
        }
      });

      if (hasOAuthParams) {
        oauthParams.forEach(param => {
          url.searchParams.delete(param);
        });
        window.history.replaceState({}, document.title, url.toString());
      }
    } catch (error) {
      // Silently fail - URL cleanup is not critical
    }
  };

  /**
   * Logout
   */
  const logout = async () => {
    try {
      const headers: Record<string, string> = getAuthHeaders(domainKey);

      // Include access token in logout request if available
      if (accessTokenRef.current) {
        headers["Authorization"] = `Bearer ${accessTokenRef.current}`;
      }

      await fetch(`${authServiceUrl}/auth/logout`, {
        method: "POST",
        headers,
        credentials: "include",
      });

      // Clear all state
      setUser(null);
      setIsAuthenticated(false);
      setAccessDenied(null);
      clearAccessToken();
      localStorage.removeItem("maven_sso_user");
      localStorage.removeItem("maven_sso_code");

    } catch (error) {
      console.error("Logout error:", error);
      // Still clear local state even if API call fails
      setUser(null);
      setIsAuthenticated(false);
      setAccessDenied(null);
      clearAccessToken();
      localStorage.removeItem("maven_sso_user");
    }
  };

  // Automatically handle OAuth callback code
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    // Skip if this is a QuickBooks OAuth callback (has realmId parameter)
    // QuickBooks uses realmId to identify the company - Teamwork OAuth doesn't use this
    const isQuickBooksCallback = urlParams.has('realmId');
    if (isQuickBooksCallback) {
      return;
    }

    if (code && !isAuthenticated) {
      // Prevent duplicate login attempts
      const previousCode = localStorage.getItem("maven_sso_code");
      if (previousCode === JSON.stringify(code)) {
        return;
      }

      login(code).catch(() => {
        // Auto-login failed, user can retry manually
      });
    }
  }, [isAuthenticated, login]);

  // Check authentication on mount
  useEffect(() => {
    // Skip checkAuth if there's a Teamwork OAuth code in URL - login will handle it
    // But DO run checkAuth for QuickBooks callbacks (which have realmId parameter)
    const urlParams = new URLSearchParams(window.location.search);
    const hasOAuthCode = urlParams.has('code');
    const isQuickBooksCallback = urlParams.has('realmId');

    if (!hasOAuthCode || isQuickBooksCallback) {
      checkAuth();
    }

    // Cleanup on unmount
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [checkAuth]);

  return {
    user,
    setUser,
    loading,
    isAuthenticated,
    login,
    logout,
    error,
    accessDenied,
    authServiceUrl,
    // Expose method to get current Maven access token (for sending to your backend)
    getAccessToken: () => accessTokenRef.current,
  };
}
