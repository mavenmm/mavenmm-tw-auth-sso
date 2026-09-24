// User interface for Teamwork users
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
  company: {
    id: number;
    name: string;
    logo: string;
  };
}

/**
 * Why the auth service refused this person, when it did. Set when sign-in or a
 * session refresh is answered 403 — e.g. Maven's access rule does not let this
 * account into this app. `message` is written for the person to read; show it
 * rather than a generic error. `code` is a stable identifier (e.g.
 * "app_not_allowed", "no_permissions") for apps that want their own wording.
 */
export interface AccessDenied {
  code: string;
  message: string;
}

// Auth context interface for React components
export interface AuthContextType {
  user: User | null;
  logout: () => Promise<void>;
  loading: boolean;
  isAuthenticated: boolean;
  getAccessToken: () => string | null;
  /** Set when the auth service refused sign-in; null otherwise. <Login> shows it. */
  accessDenied: AccessDenied | null;
}

// Login result interface
export interface LoginResult {
  success: boolean;
  user?: User;
  error?: string;
}

// Login component props interface
export interface LoginProps {
  clientID?: string;
  redirectURI?: string;
  clientSecret?: string;
}
