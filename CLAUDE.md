# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains the NPM package for Maven Marketing's centralized SSO system:

1. **NPM Package** (`teamwork-auth/`): Frontend-only React package for consuming client apps
2. **Auth Service** (MIGRATED): Now hosted on **maven-dashboard server** at `/auth/*` routes

> **Note (v3.0)**: The auth service has been migrated from Netlify serverless functions in this repo
> to the **maven-dashboard server** (Digital Ocean droplet). The `functions/` directory is now legacy.
> See `maven-dashboard/server/lib/auth/` for the current auth service implementation.

### Architecture (v3.0) - Centralized SSO with Redis
- **Auth Service**: Hosted on maven-dashboard server at `auth.mavenmm.com/auth/*`
- **Frontend Package**: React components/hooks that communicate with auth service
- **Redis-backed**: Token blacklisting, rate limiting, and session persistence
- **Zero Backend Code**: Individual Maven apps only need the frontend React package
- **Multi-Site Support**: Works across all `*.mavenmm.com` subdomains with shared cookie domain
- **Single Point of Security**: All Teamwork API tokens and JWT secrets managed centrally

## Development Commands

### NPM Package Development
```bash
npm run build           # Build frontend package only
npm run build:watch     # Build in watch mode
npm run dev             # Alias for build:watch
npm run test            # Run Jest unit tests
npm run type-check      # TypeScript type checking
```

### Auth Service Development (MIGRATED to maven-dashboard)
```bash
# Auth service is now hosted on maven-dashboard server
cd maven-dashboard/server/
yarn install           # Install dependencies
yarn start             # Start server on port 4000 (includes /auth/* routes)

# Auth routes are at: maven-dashboard/server/lib/auth/
# The functions/ directory in this repo is now legacy
```

## Architecture

### Simplified Build System (v2.0)
The package now uses a single Rollup build target:
- **Main package** (`src/index.ts` → `dist/index.esm.js`) - Frontend React components and hooks only

### Package Exports Structure
The package provides a single entry point:
- Main export: React components (`useTeamworkAuth`, `Login`, `AuthProvider`, `TeamworkAuthConfig`)

### Frontend Components (NPM Package)
- **useTeamworkAuth**: Core authentication hook with auto-detection (zero config needed!)
- **AuthProvider**: React context provider for auth state management (requires React Router context)
- **Login**: Pre-built login component using `@teamwork/login-button`
- **TeamworkAuthConfig**: TypeScript interface for optional configuration overrides

### Auth Service Components (MIGRATED to `maven-dashboard/server/lib/auth/`)
- **Express Routes**: Auth handlers at `/auth/*` (`login.ts`, `logout.ts`, `refresh.ts`, `checkAuth.ts`, `token.ts`, `user.ts`, `sso.ts`)
- **Middleware**: Domain validation, CORS, rate limiting (Redis-backed)
- **Utils**: Token manager with Redis blacklisting, security headers, logger
- **Config**: Domain registry for registered apps

### Configuration (Auto-Detection v3.0)
- **NPM Package**: Zero configuration! Auto-detects localhost:4000 vs production auth.mavenmm.com
  - Optional manual override: `useTeamworkAuth({ authServiceUrl: 'custom-url' })`
- **Auth Service**: Runs on maven-dashboard server port 4000 (routes at `/auth/*`)
- **Environment Variables**: Configured on maven-dashboard server (Teamwork OAuth credentials, JWT secrets, domain keys)

### TypeScript Types
Comprehensive type definitions in `src/types/index.ts` covering:
- User and authentication interfaces
- Netlify Function event/response types
- Configuration interfaces for different deployment scenarios
- Maven SSO specific types

## Testing Strategy

The project uses Jest with TypeScript for testing:
- Unit tests for React components and hooks
- Integration tests for Netlify Functions (`test:netlify` command)
- JSDOM environment for React component testing
- Coverage collection excluding type definitions and main index file

## Important Development Notes

- **Router Dependency**: `AuthProvider` must be placed inside React Router context (within a Route element)
- **Peer Dependencies**: React, React DOM, and React Router DOM are peer dependencies
- **Browser Compatibility**: Includes polyfills for buffer and process in browser environments
- **Security**: Uses HttpOnly cookies for authentication tokens
- **Subdomain Support**: Configurable cookie domain for cross-subdomain authentication

## Local Testing

### Current Status (✅ COMPLETE & WORKING)
✅ **Full Authentication Flow Working**: Complete OAuth login → persistent sessions → logout flow
✅ **Cross-Port Cookie Authentication**: Cookies shared between localhost:3000 and localhost:9100
✅ **URL Cleanup**: OAuth parameters automatically removed from URL after login
✅ **State Persistence**: Authentication state survives page refreshes
✅ **Environment Variables**: All Teamwork OAuth credentials loading correctly

### Local Testing Setup
```bash
# Terminal 1 - Auth Service (maven-dashboard server)
cd maven-dashboard/server/
yarn start  # Runs on port 4000 with /auth/* routes

# Terminal 2 - Test App (or your client app)
cd test-app/  # or your client app
npm run dev
```

### Environment Configuration
- **Auth Service**: `.env` file on maven-dashboard server
- **Client Apps**: Need `VITE_CLIENT_ID`, `VITE_REDIRECT_URI`, `VITE_DOMAIN_KEY`
- **Server vars**: `JWT_KEY`, `JWT_REFRESH_KEY`, `TEAMWORK_CLIENT_ID`, `TEAMWORK_CLIENT_SECRET`, `DOMAIN_KEY_*`

### ✅ Issues Resolved
1. **✅ Login Button Fixed**: Environment variables now loading properly via Login component props
2. **✅ OAuth Flow Complete**: Full authentication flow working end-to-end
3. **✅ Cookie Domain**: Fixed localhost cookie sharing with `.localhost` domain
4. **✅ Content-Type Headers**: Auth service now sends proper JSON Content-Type headers
5. **✅ HttpOnly Cookie Access**: Frontend properly handles httpOnly cookies via API calls
6. **✅ React Re-renders**: Fixed multiple hook executions by memoizing auth config

### Testing Progress
- ✅ Auth service functions working (checkAuth, login, logout, sso, dashboardPersonById)
- ✅ CORS working between test app (3000) and auth service (9100)
- ✅ Environment variables loaded in auth service
- ✅ TypeScript errors resolved in test app
- ✅ Complete OAuth login flow functional
- ✅ Authentication state persistence across page refreshes
- ✅ Automatic URL cleanup after OAuth callback
- ✅ Proper JWT validation and cookie handling
- ✅ Auto-detection of auth service URL (localhost:4000 vs production)
- ✅ Helpful error messages when auth service is unreachable

### Key Technical Learnings
1. **maven-dashboard Server**: Auth routes at `/auth/*` on port 4000
2. **Zero Config Package**: Auto-detects environment (localhost:4000 vs auth.mavenmm.com)
3. **Cookie Domain for Localhost**: Use `.localhost` domain to share cookies across ports
4. **HttpOnly Cookies**: Frontend cannot read httpOnly cookies - must use API calls to check auth state
5. **Redis-backed**: Token blacklisting and rate limiting persist across server restarts
6. **React Hook Dependencies**: No longer needed with auto-detection!
7. **CORS for Development**: Centralized CORS middleware essential for localhost cross-port communication
8. **Server-to-Server Requests**: Need explicit `Origin` header for domain validation

### 🎯 Deployment Readiness (v3.0)

**Status**: ✅ **PRODUCTION DEPLOYED**

The centralized SSO system is now complete and deployed on maven-dashboard server:

#### ✅ Core Components Deployed
- **NPM Package**: Frontend React components published and ready for consumption
- **Auth Service**: Express routes on maven-dashboard server at `auth.mavenmm.com/auth/*`
- **Redis**: Session persistence, token blacklisting, rate limiting

#### ✅ Security Features Implemented
- HttpOnly cookies for XSS protection
- JWT tokens with 15-minute expiry (access) and 7-day expiry (refresh)
- Redis-backed token blacklisting for immediate revocation
- CORS protection with explicit domain allowlists
- Rate limiting to prevent brute force attacks
- Domain authentication keys to prevent domain spoofing

#### ✅ Production Features
- Cross-subdomain authentication (*.mavenmm.com)
- Persistent sessions that survive server restarts
- Automatic token refresh and rotation
- Single-use refresh tokens

#### 📋 Maintenance Tasks
1. **Update Client Apps**: Ensure all apps use v3.0 package
2. **Monitor Redis**: Watch for memory usage in token blacklist
3. **Rotate Domain Keys**: Periodically update domain authentication keys

## Multi-Site Integration

### Adding Auth to New Maven Apps (v3.0 Zero Config!)

For any new Maven app (e.g., `app1.mavenmm.com`, `admin.mavenmm.com`):

```tsx
// In your Maven app - ZERO CONFIG NEEDED!
import { useTeamworkAuth } from '@mavenmm/teamwork-auth';

function App() {
  // Auto-detects production (auth.mavenmm.com/auth/*) vs local (localhost:4000/auth/*)
  const { user, isAuthenticated, logout, error } = useTeamworkAuth();

  // Show helpful error if auth service is unreachable
  if (error) {
    return <div>{error}</div>;
  }

  // No backend code needed!
  return <div>Welcome {user?.firstName}!</div>;
}
```

**For local development:**
```bash
# Terminal 1 - Start maven-dashboard server (includes auth routes)
cd maven-dashboard/server/
yarn start  # Runs on port 4000 with /auth/* routes

# Terminal 2 - Start your Maven app
npm run dev
```

### Benefits of Centralized Approach
- **Zero Configuration**: Auto-detects environment, no manual config needed
- **Security**: Teamwork API tokens never leave `auth.mavenmm.com`
- **Maintenance**: Update auth logic in one place for all apps
- **Simplicity**: New apps need zero backend auth code
- **Consistency**: Same user experience across all Maven properties
- **Developer Experience**: Helpful error messages guide developers

## Security Architecture

### ⚠️ CRITICAL SECURITY NOTES

**Teamwork API Token Protection**:
- Permanent Teamwork API tokens are stored ONLY in maven-dashboard server `.env`
- Tokens never transmitted to frontend applications
- Short-lived JWT access tokens (15-minute expiry) with refresh tokens (7-day expiry)
- HttpOnly cookies prevent XSS access to refresh tokens

**Security Features (v3.0)**:
1. **Redis Token Blacklisting**: Immediate revocation on logout
2. **Rate Limiting**: Redis-backed brute force protection
3. **Domain Authentication Keys**: Unique keys per registered domain
4. **Cookie Security**: `secure: true`, `sameSite: 'lax'`, `httpOnly: true` in production
5. **CORS Allowlist**: Explicit domain registration required

**Security Best Practices**:
- Domain keys are unique per application (never share between apps)
- All `*.mavenmm.com` cookies share `.mavenmm.com` domain
- Refresh tokens are single-use and rotated on each use
- Access tokens are stored in memory (not localStorage)

## CLI Tool

The package includes a scaffold CLI (`mavenmm-scaffold`) that generates:
- Netlify Functions template files
- Environment configuration examples
- Basic project setup for SSO integration