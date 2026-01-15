# Production Deployment Guide

**Goal:** Deploy the centralized SSO system to production and enable all Maven apps to use it safely.

**Timeline:** Production ready today

---

## Table of Contents

1. [Current Status](#current-status)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Steps](#deployment-steps)
4. [Integrating Maven Apps](#integrating-maven-apps)
5. [Local Development Setup](#local-development-setup)
6. [Security Verification](#security-verification)
7. [Testing & Validation](#testing--validation)
8. [Rollback Plan](#rollback-plan)

---

## Current Status

### ✅ Complete
- Auth service fully functional (`auth-service/`)
- NPM package ready (`@mavenmm/teamwork-auth` v2.2.1)
- Zero-config auto-detection working
- `/token` endpoint implemented (`functions/token.ts`)
- Local testing on port 9100 verified
- Cross-subdomain authentication working

### 🔄 Pending
- Commit `functions/token.ts` to git
- Security hardening (remove token logging)
- Deploy auth service to `auth.mavenmm.com`
- Publish NPM package (if not already published)
- Register production domains in domain registry
- Update environment variables for production

---

## Pre-Deployment Checklist

### 1. Code Readiness

- [ ] **Commit pending changes**
  ```bash
  git status
  # Should show: functions/token.ts (untracked)
  #              teamwork-auth/CLAUDE.md (modified)
  #              teamwork-auth/package.json (modified)

  git add functions/token.ts teamwork-auth/
  git commit -m "Add /token endpoint for third-party Teamwork API access"
  git push origin main
  ```

- [ ] **Remove production token logging** (SECURITY CRITICAL)
  - Review all files for `console.log()` statements that expose tokens
  - Check files:
    - `functions/middleware/cors.ts`
    - `functions/login.ts`
    - `functions/checkAuth.ts`
    - `functions/token.ts`
    - `functions/utils/tokenManager.ts`
  - Replace with proper logging using `logger` utility
  - Ensure no access tokens, refresh tokens, or JWT secrets are logged

- [ ] **Update cookie settings for production**
  - File: `functions/login.ts` (and any other files setting cookies)
  - Ensure cookies have:
    ```typescript
    {
      httpOnly: true,
      secure: true,  // MUST be true in production (HTTPS only)
      sameSite: 'lax', // or 'strict' for better CSRF protection
      domain: '.mavenmm.com',  // Share across all subdomains
      maxAge: 7 * 24 * 60 * 60 // 7 days
    }
    ```

- [ ] **Verify CORS configuration**
  - File: `functions/middleware/cors.ts`
  - Ensure explicit allowlist (no origin reflection in production)
  - Allowed origins should be:
    ```typescript
    const ALLOWED_ORIGINS = [
      'https://auth.mavenmm.com',
      // Add all production Maven apps:
      'https://home.mavenmm.com',
      'https://status.mavenmm.com',
      'https://paab.mavenmm.com',
      'https://job-tracker.mavenmm.com',
      'https://dashboard.mavenmm.com',
      // ... other apps
      // Staging (Netlify):
      'https://teamfeedback.netlify.app',
      // ... other staging apps
      // Local development:
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080',
      // ... other local ports
    ];
    ```

### 2. Environment Variables

#### Auth Service Environment Variables (Netlify)

Set these in Netlify dashboard for `auth.mavenmm.com`:

```bash
# Teamwork OAuth Credentials
VITE_CLIENT_ID=<teamwork_oauth_client_id>
VITE_CLIENT_SECRET=<teamwork_oauth_client_secret>
VITE_REDIRECT_URI=https://auth.mavenmm.com/.netlify/functions/sso

# JWT Secrets (generate secure random strings)
JWT_KEY=<secure_random_string_for_jwt_signing>
REFRESH_TOKEN_SECRET=<secure_random_string_for_refresh_tokens>

# Domain Authentication Keys
DEV_KEY=dev_localhost_shared  # For localhost development
# Add production keys for each domain (see Domain Registry below)
```

**Generate secure keys:**
```bash
# Generate JWT_KEY
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate REFRESH_TOKEN_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### NPM Package (Consumer Apps)

Each Maven app needs these environment variables:

```bash
# For local development
VITE_CLIENT_ID=<teamwork_oauth_client_id>
VITE_REDIRECT_URI=http://localhost:3000  # Match your dev port
VITE_DOMAIN_KEY=dev_localhost_shared

# For production (*.mavenmm.com)
VITE_CLIENT_ID=<teamwork_oauth_client_id>
VITE_REDIRECT_URI=https://your-app.mavenmm.com
VITE_DOMAIN_KEY=<unique_production_key>  # See Domain Registry below

# For staging (*.netlify.app)
VITE_CLIENT_ID=<teamwork_oauth_client_id>
VITE_REDIRECT_URI=https://your-app.netlify.app
VITE_DOMAIN_KEY=<unique_staging_key>  # See Domain Registry below
```

### 3. Domain Registry Setup

- [ ] **Register all production Maven apps**
  - File: `functions/config/domains.ts`
  - Add entries for each Maven app:

  ```typescript
  export const DOMAIN_REGISTRY: DomainConfig[] = [
    // Development
    {
      domain: 'localhost',
      allowedOrigins: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'],
      key: 'dev_localhost_shared',  // Shared across all localhost ports
    },

    // Production Apps
    {
      domain: 'home.mavenmm.com',
      allowedOrigins: ['https://home.mavenmm.com'],
      key: '<generate_unique_key_1>',  // Use crypto.randomBytes(32).toString('hex')
    },
    {
      domain: 'admin.mavenmm.com',
      allowedOrigins: ['https://admin.mavenmm.com'],
      key: '<generate_unique_key_2>',
    },
    // Add all other Maven apps...

    // Staging Apps (Netlify)
    {
      domain: 'teamfeedback.netlify.app',
      allowedOrigins: ['https://teamfeedback.netlify.app'],
      key: '<generate_unique_key_staging>',
    },
    // Add other staging apps...
  ];
  ```

- [ ] **Generate unique domain keys**
  ```bash
  # For each production domain, generate a unique key:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- [ ] **Document domain keys securely**
  - Store domain keys in password manager (1Password, LastPass, etc.)
  - Share with DevOps team securely
  - Each Maven app owner needs their domain key for `VITE_DOMAIN_KEY`

### 4. Teamwork OAuth Configuration

- [ ] **Update Teamwork OAuth app settings**
  - Log in to Teamwork Admin
  - Go to OAuth Applications settings
  - Add redirect URI: `https://auth.mavenmm.com/.netlify/functions/sso`
  - Verify client ID and secret match environment variables

---

## Deployment Steps

### Step 1: Deploy Auth Service to Netlify

1. **Link repository to Netlify**
   ```bash
   # In auth-service/ directory
   netlify login
   netlify init
   # Choose: Create & configure a new site
   # Site name: auth-mavenmm-com
   ```

2. **Configure build settings**
   - Build command: `npm run build`
   - Publish directory: `functions/`
   - Functions directory: `functions/`

3. **Set environment variables**
   - Go to Netlify dashboard → Site settings → Environment variables
   - Add all variables from [Environment Variables](#auth-service-environment-variables-netlify) section

4. **Configure custom domain**
   - Netlify dashboard → Domain settings
   - Add custom domain: `auth.mavenmm.com`
   - Follow DNS configuration instructions
   - Enable HTTPS (automatic via Let's Encrypt)
   - Wait for SSL certificate provisioning (~5 minutes)

5. **Deploy to production**
   ```bash
   git push origin main
   # Or trigger manual deploy in Netlify dashboard
   ```

6. **Verify deployment**
   ```bash
   # Test health check
   curl https://auth.mavenmm.com/.netlify/functions/checkAuth

   # Should return 401 (not authenticated) - this is correct
   # Should NOT return 404 or 500
   ```

### Step 2: Publish NPM Package (if needed)

1. **Verify package version**
   ```bash
   cd teamwork-auth/
   cat package.json | grep version
   # Should show: "version": "2.2.1"
   ```

2. **Build package**
   ```bash
   npm run build
   npm run type-check
   ```

3. **Publish to NPM**
   ```bash
   npm login  # Login to NPM account
   npm publish
   ```

4. **Verify publication**
   ```bash
   npm view @mavenmm/teamwork-auth version
   # Should show: 2.2.1
   ```

### Step 3: Update DNS (if needed)

If `auth.mavenmm.com` doesn't exist yet:

1. **Add DNS records**
   - Go to your DNS provider (Cloudflare, Route53, etc.)
   - Add CNAME record:
     - Name: `auth`
     - Value: `<netlify-site-name>.netlify.app`
     - TTL: 300 (or auto)

2. **Wait for DNS propagation**
   ```bash
   # Check DNS resolution
   dig auth.mavenmm.com
   nslookup auth.mavenmm.com
   ```

---

## Integrating Maven Apps

### For New Maven Apps

**Step 1: Install package**
```bash
npm install @mavenmm/teamwork-auth@latest
```

**Step 2: Set environment variables**

Get your unique domain key from DevOps (from Domain Registry).

```bash
# .env
VITE_CLIENT_ID=<teamwork_oauth_client_id>
VITE_REDIRECT_URI=https://your-app.mavenmm.com
VITE_DOMAIN_KEY=<your_unique_domain_key>
```

**Step 3: Implement authentication**

```tsx
// App.tsx
import { useTeamworkAuth, Login } from '@mavenmm/teamwork-auth';

function App() {
  const { user, isAuthenticated, loading, logout } = useTeamworkAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <Login
        clientID={import.meta.env.VITE_CLIENT_ID}
        redirectURI={import.meta.env.VITE_REDIRECT_URI}
      />
    );
  }

  return (
    <div>
      <h1>Welcome, {user?.firstName}!</h1>
      <button onClick={logout}>Logout</button>
      {/* Your app content */}
    </div>
  );
}

export default App;
```

**Step 4: Deploy to production**
```bash
# Set environment variables in your deployment platform (Netlify, Vercel, etc.)
# Deploy your app
git push origin main
```

### For Existing Maven Apps (Migration)

See [Migrating Existing Apps](#migrating-existing-apps) section below.

---

## Local Development Setup

### Port Configuration

**Designated Port: 9100** (for auth service)

This port is reserved to avoid conflicts with common dev tools:
- 3000: Create React App
- 5173: Vite
- 8080: Vue CLI
- 8000: Django/Python
- **9100: Maven Auth Service** ✅

### Local Setup (One-Time)

**Step 1: Clone auth service**
```bash
git clone <repo-url> maven-auth-service
cd maven-auth-service
npm install
```

**Step 2: Configure environment**
```bash
# Create .env file
cat > .env << EOF
VITE_CLIENT_ID=<your_teamwork_oauth_client_id>
VITE_CLIENT_SECRET=<your_teamwork_oauth_client_secret>
VITE_REDIRECT_URI=http://localhost:9100/.netlify/functions/sso
JWT_KEY=<local_jwt_key>
REFRESH_TOKEN_SECRET=<local_refresh_secret>
DEV_KEY=dev_localhost_shared
EOF
```

**Step 3: Start auth service**
```bash
npm run dev
# Or explicitly:
netlify dev --port 9100
```

Auth service runs at: `http://localhost:9100`

### Daily Development Workflow

**Terminal 1: Auth Service**
```bash
cd maven-auth-service/
npm run dev
# Leave running...
```

**Terminal 2: Your Maven App**
```bash
cd your-maven-app/
npm run dev
# App runs on port 3000, 5173, etc.
```

**How it works:**
1. Your app detects it's on `localhost` → uses `http://localhost:9100` (auto!)
2. User clicks login → redirected to Teamwork OAuth
3. Teamwork redirects to auth service at `localhost:9100`
4. Auth service sets cookies with domain `.localhost` (shared across ports)
5. User redirected back to your app with authentication

**No manual configuration needed!** The package auto-detects localhost.

### Local Development Tips

- **Cookie domain**: Uses `.localhost` to share cookies across ports
- **Auto-detection**: Package automatically detects `localhost:9100`
- **Hot reload**: Both auth service and your app support hot reload
- **Environment vars**: Use `dev_localhost_shared` for `VITE_DOMAIN_KEY`
- **Multiple apps**: Can run multiple Maven apps simultaneously (different ports)

---

## Security Verification

Before deploying to production, verify these security measures:

### Critical Security Checks

- [ ] **No token logging in production**
  ```bash
  # Search for console.log with sensitive data
  grep -r "console.log.*token" functions/
  grep -r "console.log.*accessToken" functions/
  grep -r "console.log.*JWT" functions/

  # Should find none (or only in development-only code)
  ```

- [ ] **HTTPS enforced**
  - All production URLs use `https://`
  - Cookie `secure: true` in production
  - No mixed content warnings

- [ ] **HttpOnly cookies**
  ```typescript
  // In cookie-setting code:
  httpOnly: true  // ✅ Prevents XSS access
  ```

- [ ] **CORS explicit allowlist**
  ```typescript
  // ❌ Bad (reflects any origin):
  'Access-Control-Allow-Origin': event.headers.origin

  // ✅ Good (explicit check):
  if (ALLOWED_ORIGINS.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin };
  }
  ```

- [ ] **Domain key validation**
  - All endpoints validate `X-Domain-Key` header
  - Timing-safe comparison used (no timing attacks)
  - Invalid keys return generic error (no info leakage)

- [ ] **Rate limiting active**
  - All endpoints have rate limits
  - Limits are reasonable:
    - `/checkAuth`: 100 req/15min
    - `/user`: 100 req/15min
    - `/token`: 100 req/15min
    - `/login`: 20 req/15min
    - `/logout`: 50 req/15min

- [ ] **JWT expiry settings**
  - Access tokens: 15 minutes (short-lived)
  - Refresh tokens: 7 days (reasonable for UX)
  - Token rotation enabled (single-use refresh tokens)

- [ ] **Environment variables secured**
  - Not committed to git (in `.gitignore`)
  - Only in Netlify dashboard / secure env config
  - No `.env` files in production deployments

### Security Testing

```bash
# Test CORS headers
curl -H "Origin: https://evil.com" https://auth.mavenmm.com/.netlify/functions/checkAuth
# Should NOT include Access-Control-Allow-Origin header

# Test domain key validation
curl -H "X-Domain-Key: invalid" https://auth.mavenmm.com/.netlify/functions/checkAuth
# Should return 403 Forbidden

# Test rate limiting
for i in {1..150}; do
  curl https://auth.mavenmm.com/.netlify/functions/checkAuth
done
# Should return 429 after ~100 requests
```

---

## Testing & Validation

### Pre-Production Testing

**1. Test auth service endpoints**
```bash
# Base URL
BASE_URL="https://auth.mavenmm.com/.netlify/functions"

# Test checkAuth (should return 401 - not authenticated)
curl -i $BASE_URL/checkAuth
# Expected: 401 Unauthorized

# Test CORS
curl -i -H "Origin: https://home.mavenmm.com" $BASE_URL/checkAuth
# Expected: Access-Control-Allow-Origin header present

# Test domain validation
curl -i -H "X-Domain-Key: dev_localhost_shared" $BASE_URL/checkAuth
# Expected: Different response than without header
```

**2. Test NPM package integration**

Create a minimal test app:
```bash
npm create vite@latest test-sso-app -- --template react-ts
cd test-sso-app
npm install
npm install @mavenmm/teamwork-auth@latest react-router-dom
```

```tsx
// src/App.tsx
import { useTeamworkAuth, Login } from '@mavenmm/teamwork-auth';

function App() {
  const { user, isAuthenticated, loading, authServiceUrl } = useTeamworkAuth();

  console.log('Auth Service URL:', authServiceUrl);
  // Should log: https://auth.mavenmm.com/.netlify/functions

  if (loading) return <div>Loading...</div>;

  if (!isAuthenticated) {
    return <Login
      clientID={import.meta.env.VITE_CLIENT_ID}
      redirectURI={window.location.origin}
    />;
  }

  return <div>Welcome {user?.firstName}!</div>;
}

export default App;
```

**3. Test full authentication flow**

- [ ] Login flow works
  - Click login button → redirected to Teamwork
  - Authenticate with Teamwork
  - Redirected back to app
  - User data loads correctly
  - URL cleaned up (no `?code=` parameter)

- [ ] Session persistence
  - Refresh page → still authenticated
  - Close tab → reopen → still authenticated
  - Check browser cookies → `maven_refresh_token` exists

- [ ] Logout flow works
  - Click logout → cookies cleared
  - User state reset
  - Redirected to login

- [ ] Cross-subdomain authentication
  - Login at `app1.mavenmm.com`
  - Navigate to `app2.mavenmm.com` → already authenticated
  - Shared cookies work across subdomains

- [ ] Token endpoint works (for third-party integrations)
  ```bash
  # Get access token first (from browser DevTools console):
  # const token = localStorage.getItem('maven_sso_access_token');

  # Test /token endpoint
  curl -H "Authorization: Bearer <access_token>" \
       -H "X-Domain-Key: <domain_key>" \
       -b "maven_refresh_token=<refresh_token>" \
       https://auth.mavenmm.com/.netlify/functions/token

  # Should return:
  # { "accessToken": "tw_xxx", "userId": "12345" }
  ```

### Production Validation

After deployment, test with real production apps:

1. **First Production App**
   - Deploy one Maven app with auth integration
   - Test full flow in production
   - Monitor Netlify function logs for errors
   - Check for CORS issues

2. **Monitor Error Rates**
   - Netlify dashboard → Functions → View logs
   - Watch for 4xx/5xx errors
   - Check for authentication failures

3. **Performance Testing**
   - Check function execution times (should be < 500ms)
   - Monitor cold start times
   - Verify rate limiting doesn't trigger for normal use

---

## Migrating Existing Apps

If you have Maven apps with their own auth systems:

### Migration Checklist

- [ ] **Backup existing auth data**
  - Export user sessions if needed
  - Document current auth flow

- [ ] **Install new package**
  ```bash
  npm install @mavenmm/teamwork-auth@latest
  ```

- [ ] **Set environment variables**
  ```bash
  VITE_CLIENT_ID=<teamwork_oauth_client_id>
  VITE_REDIRECT_URI=https://your-app.mavenmm.com
  VITE_DOMAIN_KEY=<your_unique_domain_key>
  ```

- [ ] **Register domain**
  - Add domain to `functions/config/domains.ts`
  - Deploy updated auth service

- [ ] **Replace auth code**
  - Remove old auth logic
  - Replace with `useTeamworkAuth()` hook
  - Update login/logout UI

- [ ] **Clear old auth data**
  ```tsx
  // Add one-time migration code:
  useEffect(() => {
    // Clear old auth tokens/cookies
    localStorage.removeItem('old_auth_token');
    document.cookie = 'old_cookie=; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
  }, []);
  ```

- [ ] **Test migration**
  - Test with small user group first
  - Monitor for issues
  - Gradual rollout recommended

- [ ] **Deploy to production**
  - Deploy during low-traffic period
  - Monitor closely for first few hours
  - Have rollback plan ready

---

## Rollback Plan

If issues occur in production:

### Quick Rollback (Netlify)

1. **Revert to previous deployment**
   - Netlify dashboard → Deploys
   - Find last working deployment
   - Click "Publish deploy"
   - Takes ~30 seconds

2. **Revert DNS (if needed)**
   - Point `auth.mavenmm.com` back to old auth service
   - TTL is usually 300 seconds (5 min)

### App-Level Rollback

For individual Maven apps:

1. **Revert to previous deployment**
   - Use platform's rollback feature (Netlify, Vercel, etc.)
   - Or redeploy previous git commit

2. **Restore old auth code**
   ```bash
   git revert HEAD
   git push origin main
   ```

### Full System Rollback

If multiple apps are affected:

1. Revert auth service to previous version
2. Notify all Maven app owners
3. Each app reverts to previous deployment
4. Investigate issues before re-attempting

---

## Monitoring & Maintenance

### Post-Deployment Monitoring

**Week 1:**
- Check Netlify function logs daily
- Monitor error rates
- Collect user feedback
- Watch for authentication failures

**Ongoing:**
- Weekly review of function logs
- Monthly security audit
- Update dependencies quarterly
- Review and rotate JWT secrets annually

### Key Metrics to Track

- Authentication success rate (should be > 99%)
- Average function execution time (should be < 500ms)
- Rate limit hits (should be rare)
- 4xx/5xx error rates (should be < 1%)
- Token refresh success rate (should be > 99%)

### Support & Troubleshooting

**Common Issues:**

| Issue | Cause | Solution |
|-------|-------|----------|
| "Auth service unreachable" | DNS not propagated | Wait 5-10 min, check DNS |
| CORS errors | Origin not in allowlist | Add to `functions/middleware/cors.ts` |
| "Invalid domain key" | Wrong key in env vars | Check domain registry |
| Cookies not working | HTTP instead of HTTPS | Ensure all production URLs use HTTPS |
| Token expired immediately | JWT_KEY mismatch | Verify JWT_KEY in Netlify env vars |

**Get Help:**
- Check Netlify function logs first
- Review browser console for errors
- Contact DevOps team for domain/DNS issues
- File issue in GitHub repo for package bugs

---

## Summary Checklist

Use this final checklist before going live:

### Auth Service
- [ ] `functions/token.ts` committed to git
- [ ] Token logging removed from production code
- [ ] Cookie settings updated (`secure: true`, `sameSite: 'lax'`)
- [ ] CORS explicit allowlist configured
- [ ] All domains registered in domain registry
- [ ] Environment variables set in Netlify
- [ ] Deployed to `auth.mavenmm.com`
- [ ] SSL certificate active
- [ ] DNS propagated
- [ ] Endpoints tested and working

### NPM Package
- [ ] Version 2.2.1 (or latest)
- [ ] Built and type-checked
- [ ] Published to NPM
- [ ] README updated
- [ ] CHANGELOG updated

### Security
- [ ] No tokens in logs
- [ ] HTTPS everywhere in production
- [ ] HttpOnly cookies enabled
- [ ] CORS properly configured
- [ ] Rate limiting active
- [ ] Domain keys secured
- [ ] JWT secrets rotated (not using defaults)

### Integration
- [ ] Test app successfully authenticates
- [ ] Session persistence works
- [ ] Logout works
- [ ] Cross-subdomain auth works (if applicable)
- [ ] `/token` endpoint tested (if using third-party integrations)
- [ ] Local development setup documented
- [ ] Migration guide available for existing apps

### Documentation
- [ ] This deployment guide complete
- [ ] README.md updated
- [ ] CLAUDE.md updated (for AI assistants)
- [ ] Domain keys documented securely
- [ ] Runbook created for common issues

---

## Next Steps

After successful deployment:

1. **Gradual rollout**
   - Start with 1-2 low-traffic Maven apps
   - Monitor for issues
   - Expand to more apps weekly

2. **Developer onboarding**
   - Share this guide with Maven developers
   - Provide domain keys securely
   - Offer setup assistance

3. **Documentation**
   - Create internal wiki page
   - Record demo video
   - Host Q&A session for developers

4. **Optimization**
   - Monitor performance metrics
   - Optimize slow endpoints
   - Consider CDN for static assets

5. **Future enhancements**
   - Multi-factor authentication
   - Session management UI
   - Audit logging
   - Admin dashboard

---

**Document Version:** 1.0
**Last Updated:** 2025-11-22
**Status:** Ready for production deployment
**Target Deployment:** Today

Good luck with the deployment! 🚀
