

## Diagnose: CDN Script URLs

### Finding

The CDN script URLs are **functioning correctly**:
- The edge function `cdn-router` responds with HTTP 200 and returns script content
- The custom domain `switch.bridgeapi.chat/switch-v1.js` is reachable and serves the script correctly
- I fetched the URL directly and confirmed it returns content

The CDN scripts are not broken. If you're experiencing issues in the GHL browser, it could be a temporary DNS/caching issue or the GHL environment blocking the requests.

### Unrelated Build Error (needs fixing)

There is a build error in `supabase/functions/create-checkout/index.ts` - the import `npm:@supabase/supabase-js@2.57.2` uses a version not available in the build environment. This needs to be updated to match the version used in other edge functions (e.g., `npm:@supabase/supabase-js@2`).

### Plan

1. **Fix the create-checkout import** - Change `npm:@supabase/supabase-js@2.57.2` to `npm:@supabase/supabase-js@2` in `create-checkout/index.ts` to resolve the build error.

No changes needed for the CDN router itself - it's working as expected.

