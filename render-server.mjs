// Production server for hosting the Scramjet demo on a single web service.
//
// It does two jobs on one origin:
//   1. Serves the pre-built static demo (packages/demo/dist).
//   2. Terminates Wisp WebSocket connections at /wisp/, which is the
//      transport the proxy actually uses to reach the wider internet.
//
// Because the demo and the Wisp endpoint share an origin, the browser talks
// to wss://<host>/wisp/ with no CORS and no cross-origin config. The build
// step bakes that same-origin URL into the demo via VITE_WISP_URL.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
// @ts-expect-error - wisp-js ships no type declarations
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8080;
// The websocket path is not a well-known filter signature. Overridable at
// runtime so a deployment can rotate it without a rebuild.
const WISP_PATH = process.env.WISP_PATH || "/api/socket/";
const STATIC_DIR = path.join(__dirname, "packages", "demo", "dist");

// Boot-time sanity check. When the vite copy step misplaces a file, the
// SPA fallback would silently return index.html for it — the browser then
// parses HTML as JS/WASM and the demo boots to a black screen with no
// visible error. Log a clear warning so the failure mode is discoverable
// in Render's deploy logs. Kept non-fatal so /healthz still works.
const REQUIRED_ASSETS = [
	"index.html",
	"static/chunks/main.js",
	"static/chunks/main.wasm",
	"static/chunks/runtime.api.js",
	"static/chunks/runtime.inject.js",
	"static/chunks/runtime.sw.js",
];
for (const rel of REQUIRED_ASSETS) {
	const abs = path.join(STATIC_DIR, rel);
	if (!fs.existsSync(abs)) {
		console.error(`Missing required asset: ${abs}`);
	}
}

const app = express();

// Explicitly opt-in to being framed from any origin. Without this a
// hardening proxy or CDN in front may inject X-Frame-Options: SAMEORIGIN
// or Content-Security-Policy: frame-ancestors 'self', which breaks
// embedded setups (e.g. an about:blank trampoline iframe hosting the
// proxy). We overwrite whatever upstream set.
//
// The scheme list matters. Per the CSP spec (and Chrome's enforcement),
// `frame-ancestors *` matches only network schemes — http, https, ws,
// wss. It does NOT match file:, data:, blob:, or about:. A trampoline
// opened from a launcher.html on disk (file://) creates an about:blank
// popup that inherits the file: scheme; when its iframe requests this
// origin, Chrome checks the ancestor chain, sees a non-network scheme,
// and refuses with "refused to connect". The same trap catches blob:
// and data: launchers. Enumerate every scheme we want to allow rather
// than relying on `*`.
app.use((_req, res, next) => {
	res.removeHeader("X-Frame-Options");
	res.removeHeader("Content-Security-Policy");
	res.setHeader(
		"Content-Security-Policy",
		"frame-ancestors * data: blob: file: about:"
	);
	next();
});

// Serve the built demo. express.static already sends the correct
// Content-Type for .wasm (application/wasm) and .mjs (text/javascript);
// the explicit header below is belt-and-suspenders for older resolvers.
app.use(
	express.static(STATIC_DIR, {
		setHeaders(res, filePath) {
			if (filePath.endsWith(".wasm")) {
				res.setHeader("Content-Type", "application/wasm");
			}
		},
	})
);

// Lightweight health check for uptime monitors (e.g. UptimeRobot). Kept
// before the SPA fallback so a keep-alive ping returns a few bytes instead
// of downloading the whole demo shell each time.
app.get("/healthz", (_req, res) => {
	res.type("text/plain").send("ok");
});

// Single-page-app fallback: anything that isn't a real file gets the shell.
// Proxied requests are handled by the service worker in the browser and
// never reach this server.
//
// Exception: requests for real asset extensions (.js/.mjs/.wasm/.css/
// .map/.json/.png/.svg/.ico/.woff2) return a real 404 instead of the
// shell HTML. Otherwise a missing file would come back as index.html
// under the wrong Content-Type — the browser parses HTML as JS and the
// demo silent-fails (see boot-time asset check above). A real 404
// surfaces the misplaced file immediately in DevTools.
const ASSET_EXTENSIONS =
	/\.(?:js|mjs|wasm|css|map|json|png|svg|ico|jpg|jpeg|gif|webp|woff2?|ttf|otf|eot)$/i;
app.get(/.*/, (req, res) => {
	if (ASSET_EXTENSIONS.test(req.path)) {
		res.status(404).type("text/plain").send("Not Found");
		return;
	}
	res.sendFile(path.join(STATIC_DIR, "index.html"));
});

const server = http.createServer(app);

// Route only /wisp/ upgrades into the Wisp server; reject other upgrades.
// Note: we intentionally leave allow_private_ips / allow_loopback_ips at
// their safe defaults (disabled) so the proxy can't be used to reach the
// host's internal network.
server.on("upgrade", (req, socket, head) => {
	const url = new URL(req.url ?? "/", "http://localhost");
	if (url.pathname === WISP_PATH || url.pathname === WISP_PATH.slice(0, -1)) {
		wisp.routeRequest(req, socket, head);
	} else {
		socket.destroy();
	}
});

server.listen(PORT, () => {
	console.log(`Scramjet listening on :${PORT} (wisp at ${WISP_PATH})`);
});
