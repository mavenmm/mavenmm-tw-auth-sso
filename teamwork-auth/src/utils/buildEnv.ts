/**
 * The domain key from the consuming app's build environment.
 *
 * Kept in its own module, byte-for-byte as it was in useTeamworkAuth, for one
 * reason: `import.meta` is a syntax error under Jest's CommonJS transform, so any
 * test that imported the hook failed to load at all. Tests mock this module; the
 * bundle behaves exactly as before.
 */
export function domainKeyFromBuildEnv(): string | undefined {
  // Check for environment variable (Vite uses VITE_ prefix)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_DOMAIN_KEY || import.meta.env.DOMAIN_KEY;
  }

  // Check for process.env (other build tools)
  if (typeof process !== 'undefined' && process.env) {
    return process.env.VITE_DOMAIN_KEY || process.env.DOMAIN_KEY;
  }

  return undefined;
}
