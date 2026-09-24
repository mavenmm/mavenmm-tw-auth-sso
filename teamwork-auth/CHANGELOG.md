# Changelog

All notable changes to this project will be documented in this file.

## [3.1.0] - 2026-09-24

### Added
- **The reason a sign-in was refused.** The auth service refuses people its access rule
  does not let into the app (403 `{ error, code, message }`), at login and whenever it
  re-checks a session on refresh or `checkAuth`. The library used to discard that reply,
  so a refused person saw the login button again with no explanation.
  - `accessDenied: { code, message } | null` on `useTeamworkAuth()` and `useAuthContext()`.
  - `<Login>` shows `accessDenied.message` above the button when inside an `<AuthProvider>`.
  - `login()` rejects with `AccessDeniedError` (`message` = the reason, `code` = the
    refusal code) instead of a generic "Failed to log in".
  - A refused login drops the single-use `?code=` from the URL, so a reload does not retry it.
- `AccessDenied` type and `AccessDeniedError` are exported.
- First unit tests (`src/hooks/__tests__/accessDenied.test.tsx`).

### Changed
- The build-env domain-key lookup moved to `src/utils/buildEnv.ts`, unchanged, so the hook
  can load under Jest (`import.meta` is a syntax error in its CommonJS transform).

## [3.0.0] - 2026-01-15

### Breaking Changes
- **Auth service migrated to maven-dashboard server** - No longer uses Netlify serverless functions
- API endpoints changed from `/.netlify/functions/*` to `/auth/*`
- Local development port changed from 9100 to 4000 (maven-dashboard server)
- Requires maven-dashboard server for local development instead of Netlify CLI

### Added
- Redis-backed session persistence - Sessions survive server restarts
- Token blacklisting via Redis - Immediate revocation on logout
- Improved rate limiting - Redis-backed brute force protection
- Updated documentation for new architecture

### Changed
- `detectAuthServiceUrl()` now returns `http://localhost:4000` for development
- All fetch calls use `/auth/*` endpoints instead of `/.netlify/functions/*`
- Error messages updated to reference maven-dashboard server

## [2.3.4] - Previous Release

### Features
- Dual-token architecture (access + refresh tokens)
- Domain authentication keys
- Token rotation and blacklisting
- Auto-refresh before expiry
- Zero-config environment detection
- Automatic OAuth code detection
- GraphQL/serverless function support via `/token` endpoint

## [2.2.0]

### Added
- Automatic OAuth code detection - No more manual `useEffect` for OAuth callbacks
- Hook automatically processes `?code=` parameter from URL
- Duplicate login prevention built-in
- `/token` endpoint - Third-party apps can fetch Teamwork API token server-to-server
- Updated documentation with localhost shared key (`dev_localhost_shared`)
- Comprehensive migration guide for existing apps

## [2.0.4]

### Added
- `/user` endpoint to fetch user data from auth service
- Automatic user data fetching when localStorage is empty
- User data survives localStorage being cleared
- Fresh user data from Teamwork API on demand

## [2.0.3]

### Added
- CLAUDE.md for AI assistant discoverability

### Fixed
- Bug fixes for duplicate login prevention
- Improved user data handling

## [2.0.0]

### Added
- Dual-token architecture (access + refresh tokens)
- Domain authentication keys for registered apps
- Token rotation and blacklisting
- Auto-refresh before expiry
- Zero-config environment detection
