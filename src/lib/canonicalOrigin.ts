/**
 * Canonical public origin used for OAuth redirect URIs.
 *
 * Why: the in-editor Preview runs on a temporary domain, but OAuth providers
 * typically require an exact redirect URL matching the public/published domain.
 *
 * You can override this by defining VITE_PUBLIC_APP_URL in the environment.
 */
export const CANONICAL_APP_ORIGIN = (
  import.meta.env.VITE_PUBLIC_APP_URL as string | undefined
)?.replace(/\/$/, "") || "https://bridgeapi.chat";

export function getOAuthRedirectUri() {
  return `${CANONICAL_APP_ORIGIN}/oauth/callback`;
}
