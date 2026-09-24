// Ensure polyfills are loaded for browser compatibility
import "./utils/polyfills";

// Main exports for Teamwork Auth package - Centralized Auth Service
export { useTeamworkAuth, AccessDeniedError, type TeamworkAuthConfig } from "./hooks/useTeamworkAuth";
export { Login } from "./components/Login";

// Auth Provider (React Context)
export {
  default as AuthProvider,
  useAuthContext,
  type AuthProviderProps,
} from "./providers/AuthProvider";

// Types
export type {
  User,
  AuthContextType,
  AccessDenied,
  LoginResult,
} from "./types";

// Note: This package works with an external centralized auth service
// No backend code needed in individual apps!
//
// Usage Option 1 - Direct Hook:
// import { useTeamworkAuth } from '@mavenmm/teamwork-auth';
//
// const config = {
//   authServiceUrl: 'https://auth.yourcompany.com',  // Required: Your auth service URL
//   cookieDomain: '.yourcompany.com'                 // Optional: For cross-subdomain auth
// };
// const { user, isAuthenticated, logout } = useTeamworkAuth(config);
//
// Usage Option 2 - Auth Provider:
// import { AuthProvider } from '@mavenmm/teamwork-auth';
//
// <AuthProvider authConfig={config}>
//   <YourApp />
// </AuthProvider>
