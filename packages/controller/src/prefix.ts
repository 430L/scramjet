// Shared between the page-side controller and the service worker bundle.
//
// Kept in its own module deliberately: sw.ts must not import from index.ts,
// which would pull the entire controller (and its transport dependencies)
// into the service worker bundle.

/**
 * Path prefix under which every proxied request is served.
 *
 * Individual frames live at `${DEFAULT_PREFIX}<controllerId>/<frameId>/`, but
 * the service worker needs the static root: after the browser evicts an idle
 * worker its in-memory tab registry is empty, and without a path-shaped test
 * it would decline to route proxied requests until a controller re-registers.
 * Those requests would then hit the network and be answered by the server's
 * SPA fallback, i.e. the app would load a copy of itself inside its own frame.
 */
export const DEFAULT_PREFIX = "/static/render/";
