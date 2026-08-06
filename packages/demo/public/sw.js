// SW-VERSION: 2 (asset paths renamed to /static/chunks/*)
// Bumping this comment when the imported paths change forces the browser
// to detect a byte-level diff and update returning users' registrations.
// Without it, a stale worker still calls importScripts("/assets/core.sw.js")
// which now 404s and breaks SW install for anyone who visited pre-rename.
importScripts("/static/chunks/runtime.sw.js");

addEventListener("fetch", (e) => {
	if ($akController.shouldRoute(e)) {
		e.respondWith($akController.route(e));
	}
});
