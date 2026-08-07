// One-time cleanup of client state left behind by earlier builds.
//
// This app has been through two rounds of asset renames. Both of them changed
// the path that the registered service worker's importScripts() points at:
//
//   /controller/controller.sw.js   (original)
//   /assets/core.sw.js             (de-fingerprinting rename, b802152)
//   /static/chunks/runtime.sw.js   (current)
//
// A browser that visited an older build still holds a registration whose
// script body references a path that now 404s. importScripts() throws during
// SW evaluation, install fails, and every subsequent navigation is served by
// nothing — the page loads, the controller never gets a service worker, and
// the user sits on a dead screen. The `// SW-VERSION:` comment in
// public/sw.js forces a byte-diff so the browser *notices* an update, but a
// worker that cannot evaluate can still wedge the registration, so we also
// unregister anything whose scriptURL is not the current one.
//
// The same renames orphaned a set of storage keys. They are harmless but they
// accumulate, and the stale Cache Storage entry in particular can hold
// megabytes of responses keyed under a prefix nothing reads anymore.
//
// Guarded by a sentinel so this runs at most once per browser profile, and
// reloads at most once. A heal that ran on every load would be a reload loop.

const HEAL_SENTINEL = "ak-heal-v1";

// Per-tab guard for the post-unregister reload. Deliberately sessionStorage
// and deliberately separate from HEAL_SENTINEL: the storage cleanup is
// once-per-profile, but unregistering a stale worker must be able to trigger
// a reload again after some *future* rename, not just the first ever time.
const RELOAD_GUARD = "ak-heal-reloaded";

/** Service worker script URL this build registers. */
const CURRENT_SW_PATH = "/sw.js";

/** Cache Storage keys owned by builds before the de-fingerprinting rename. */
const LEGACY_CACHE_KEYS = ["scramjet-http-cache-v2"];

/** localStorage idents owned by builds before the de-fingerprinting rename. */
const LEGACY_LOCALSTORAGE_KEYS = [
	"scramjet-demo-settings",
	"scramjet-flags",
	"scramjet-demo-playground-projects-v1",
];

/** IndexedDB databases owned by builds before the de-fingerprinting rename. */
const LEGACY_IDB_NAMES = ["__scramjet_controller", "scramjet-bootstrap"];

function isCurrentServiceWorker(scriptURL: string): boolean {
	try {
		return new URL(scriptURL).pathname === CURRENT_SW_PATH;
	} catch {
		return false;
	}
}

/**
 * Unregister service workers left over from a previous asset layout.
 *
 * Runs on every load, not just the first: a registration can go stale at any
 * point after a deploy, and it is the one piece of stale state that is
 * actually fatal. Returns true if anything was unregistered, which means the
 * page is now uncontrolled and should reload to pick up a fresh worker.
 */
async function unregisterStaleServiceWorkers(): Promise<boolean> {
	if (!("serviceWorker" in navigator)) return false;

	let removed = false;
	try {
		const registrations = await navigator.serviceWorker.getRegistrations();
		for (const registration of registrations) {
			const worker =
				registration.active ?? registration.waiting ?? registration.installing;
			// A registration with no worker at all is mid-install; leave it be.
			if (!worker) continue;
			if (isCurrentServiceWorker(worker.scriptURL)) continue;

			console.warn(
				`Unregistering stale service worker: ${worker.scriptURL} ` +
					`(expected ${CURRENT_SW_PATH})`
			);
			if (await registration.unregister()) removed = true;
		}
	} catch (error) {
		// Storage can be unavailable (partitioned/blocked). Not fatal — the
		// normal registration path will surface a real error if it matters.
		console.warn("Could not enumerate service worker registrations:", error);
	}

	return removed;
}

/** Drop orphaned Cache Storage / localStorage / IndexedDB entries. */
async function dropLegacyStorage(): Promise<void> {
	if ("caches" in self) {
		try {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => LEGACY_CACHE_KEYS.includes(key))
					.map((key) => caches.delete(key))
			);
		} catch (error) {
			console.warn("Could not clear legacy caches:", error);
		}
	}

	try {
		for (const key of LEGACY_LOCALSTORAGE_KEYS) localStorage.removeItem(key);
	} catch (error) {
		console.warn("Could not clear legacy localStorage entries:", error);
	}

	// deleteDatabase blocks indefinitely if another tab holds a connection, so
	// never await it directly — fire and forget, and let it land whenever.
	try {
		for (const name of LEGACY_IDB_NAMES) indexedDB.deleteDatabase(name);
	} catch (error) {
		console.warn("Could not delete legacy IndexedDB databases:", error);
	}
}

/**
 * Repair client state carried over from an older build.
 *
 * Returns true when the caller should reload instead of continuing to boot:
 * a stale worker was removed and the page is now running uncontrolled.
 */
export async function healStaleClientState(): Promise<boolean> {
	const removedWorker = await unregisterStaleServiceWorkers();

	let alreadyHealed = false;
	try {
		alreadyHealed = localStorage.getItem(HEAL_SENTINEL) === "1";
	} catch {
		// localStorage unavailable — skip the one-shot work entirely rather
		// than repeating it on every load.
		alreadyHealed = true;
	}

	if (!alreadyHealed) {
		await dropLegacyStorage();
		try {
			localStorage.setItem(HEAL_SENTINEL, "1");
		} catch {
			// Nothing to do; worst case the cleanup repeats next load.
		}
	}

	if (!removedWorker) return false;

	// Reload at most once per tab. If sessionStorage is unavailable we cannot
	// prove we haven't already reloaded, so don't — a boot without a worker
	// still surfaces a real error, but a reload loop shows nothing at all.
	try {
		if (sessionStorage.getItem(RELOAD_GUARD) === "1") return false;
		sessionStorage.setItem(RELOAD_GUARD, "1");
	} catch {
		return false;
	}

	return true;
}
