import LoadInterstitial from "./components/LoadInterstitial";
import App from "./App";
import LibcurlClient from "@mercuryworkshop/libcurl-transport";
import EpoxyClient from "@mercuryworkshop/epoxy-transport";
import { defaultConfig } from "@mercuryworkshop/scramjet";
import { Controller } from "@mercuryworkshop/scramjet-controller";
import { HttpCachePlugin } from "@mercuryworkshop/scramjet-utils";
import { demoSettingsStore } from "./store";
import { healStaleClientState } from "./boot/heal";

let app = document.getElementById("app")!;

const cachePlugin = new HttpCachePlugin();

// Every boot step below is bounded. The failure this guards against is not a
// thrown error — those were already caught — but an await that never settles:
// a service worker stuck in `installing`, a wasm fetch against a sleeping
// host that neither completes nor errors. An unbounded await leaves the modal
// interstitial open forever, and a modal dialog makes the entire page inert.
// That is the "black screen where nothing happens".
const SW_CONTROL_TIMEOUT_MS = 20_000;
const CONTROLLER_INIT_TIMEOUT_MS = 45_000;

/**
 * Resolves once the controller exists and has finished initialising.
 *
 * Consumers must await this rather than touching `controller` directly:
 * the binding is undefined until boot completes, and a component that
 * dereferences it early throws an unhandled TypeError with no visible effect
 * beyond a permanently empty panel.
 */
let signalControllerReady!: (value: InstanceType<typeof Controller>) => void;
const controllerReady = new Promise<InstanceType<typeof Controller>>(
	(resolve) => {
		signalControllerReady = resolve;
	}
);

export function whenControllerReady(): Promise<InstanceType<typeof Controller>> {
	return controllerReady;
}

export function getTransport(): LibcurlClient | EpoxyClient {
	const wispUrl = demoSettingsStore.wispUrl;
	switch (demoSettingsStore.transport) {
		case "epoxy":
			return new EpoxyClient({ wisp: wispUrl });
		case "libcurl":
		default:
			return new LibcurlClient({ wisp: wispUrl });
	}
}

class BootTimeoutError extends Error {
	constructor(label: string, ms: number) {
		super(`${label} timed out after ${Math.round(ms / 1000)}s`);
		this.name = "BootTimeoutError";
	}
}

/** Reject if `promise` hasn't settled within `ms`. */
function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	label: string
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new BootTimeoutError(label, ms)),
			ms
		);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

async function waitForControllerOrReady(
	timeoutMs = SW_CONTROL_TIMEOUT_MS
): Promise<void> {
	if (navigator.serviceWorker.controller) return;

	const ready = navigator.serviceWorker.ready.then(() => {});
	const controllerChanged = new Promise<void>((resolve) => {
		const onChange = () => {
			navigator.serviceWorker.removeEventListener("controllerchange", onChange);
			resolve();
		};
		navigator.serviceWorker.addEventListener("controllerchange", onChange, {
			once: true,
		} as any);
	});
	const timeout = new Promise<void>((resolve) =>
		setTimeout(resolve, timeoutMs)
	);

	// Wait for whichever happens first; on timeout we continue to avoid blocking the UI.
	await Promise.race([ready, controllerChanged, timeout]);
}

/**
 * Explain a boot failure in terms the user can act on.
 *
 * The overwhelmingly common cause in production is a cold start: the host
 * sleeps when idle and takes the better part of a minute to answer the first
 * request, so the very first visitor after a quiet period sees every fetch
 * crawl. That deserves "wait and retry", not "something is broken".
 */
function hintForError(error: unknown): string {
	if (error instanceof BootTimeoutError) {
		return "The server may be waking up from sleep, which can take up to a minute. Waiting a moment and retrying usually fixes this.";
	}
	if (!navigator.onLine) {
		return "Your browser reports that it is offline.";
	}
	return "If this keeps happening, check the browser console for details.";
}

function messageFor(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

/**
 * Report the boot outcome to an embedding trampoline, if there is one.
 *
 * A launcher that hosts this app in an iframe has no other way to tell a slow
 * boot from a dead one: the iframe is cross-origin, and its `load` event fires
 * for browser error pages too. Without this signal the launcher can only guess
 * with a timer, and it guesses wrong in both directions.
 *
 * targetOrigin is "*" because the parent is typically an about:blank document
 * with an opaque origin that cannot be named. Nothing here is sensitive — it
 * is a fixed sentinel plus, on failure, the same message already shown on
 * screen.
 */
function reportBootStatus(status: "ready" | "error", message?: string) {
	if (window.parent === window) return;
	try {
		window.parent.postMessage({ __akBoot: status, message }, "*");
	} catch {
		// A parent that refuses postMessage just falls back to its own timer.
	}
}

async function boot(interstitial: any): Promise<void> {
	const setStatus = (msg: string) => (interstitial.$.state.status = msg);
	const setHint = (msg: string) => (interstitial.$.state.hint = msg);

	// A service worker is not optional here — it is how proxied requests get
	// intercepted at all. Say so plainly instead of throwing "cannot read
	// property register of undefined". This is the failure mode when the site
	// is served over plain http:// on anything other than localhost.
	if (!("serviceWorker" in navigator)) {
		throw new Error(
			window.isSecureContext
				? "This browser does not support service workers."
				: "Service workers require a secure context. Load this site over HTTPS."
		);
	}

	setStatus("Registering service worker...");
	const registration = await withTimeout(
		navigator.serviceWorker.register("./sw.js"),
		SW_CONTROL_TIMEOUT_MS,
		"Service worker registration"
	);

	// Non-blocking progress updates on state transitions.
	const updateStatus = (sw: ServiceWorker | null) => {
		if (!sw) return;
		const apply = () => {
			switch (sw.state) {
				case "installing":
					setStatus("Installing service worker...");
					break;
				case "installed":
					setStatus("Service worker installed, waiting to activate...");
					break;
				case "activating":
					setStatus("Activating service worker...");
					break;
				case "activated":
					setStatus("Service worker activated");
					break;
				case "redundant":
					setStatus("Service worker became redundant");
					break;
			}
		};
		apply();
		sw.addEventListener("statechange", apply);
	};

	updateStatus(registration.installing ?? registration.waiting ?? null);

	// Wait for control or readiness with a timeout; don't hang the UI on updates.
	setStatus("Waiting for service worker to take control...");
	await waitForControllerOrReady(SW_CONTROL_TIMEOUT_MS);

	const readySw = navigator.serviceWorker.controller ?? registration.active;
	if (!readySw) {
		throw new Error(
			"The service worker never took control of this page. Reloading usually fixes this."
		);
	}

	setStatus("Starting proxy runtime...");
	const controller = new Controller({
		serviceworker: readySw,
		transport: getTransport(),
		// Production flags. The dev preset enables trampoline debugging and
		// turns OFF allowInvalidJs, which makes the rewriter throw on scripts
		// it can't parse instead of passing them through — the wrong trade for
		// a deployed site, where a single unparseable third-party script would
		// take down the page.
		runtimeConfig: defaultConfig,
		config: {
			corePath: "/static/chunks/main.js",
			injectPath: "/static/chunks/runtime.inject.js",
			wasmPath: "/static/chunks/main.wasm",
			virtualWasmPath: "chunk.wasm.js",
		},
	});

	// A cold start legitimately takes tens of seconds. Keep the interstitial
	// visibly alive so the wait reads as slow rather than hung.
	const startedAt = Date.now();
	const ticker = setInterval(() => {
		const elapsed = Math.round((Date.now() - startedAt) / 1000);
		if (elapsed >= 8) {
			setHint(
				`Still working (${elapsed}s). The server may be waking up from sleep.`
			);
		}
	}, 1000);

	try {
		await withTimeout(
			controller.wait(),
			CONTROLLER_INIT_TIMEOUT_MS,
			"Proxy runtime initialisation"
		);
	} finally {
		clearInterval(ticker);
		setHint("");
	}

	setStatus("Ready");
	signalControllerReady(controller);
	reportBootStatus("ready");
}

async function mount() {
	try {
		const root = <App />;
		app.replaceWith(root);
	} catch (e) {
		let err = e as any;
		app.replaceWith(
			document.createTextNode(
				`Error mounting: ${"message" in err ? err.message : err}`
			)
		);
		console.error(err);
		throw e;
	}
}

async function main() {
	const interstitial: any = (
		<LoadInterstitial
			status={"Starting up..."}
			phase={"loading"}
			error={""}
			hint={""}
			// A soft in-place retry would have to tear down the previous
			// Controller, which permanently registers listeners on
			// navigator.serviceWorker and has no dispose(). Reloading is the
			// only way to guarantee a clean second attempt.
			onRetry={() => location.reload()}
		/>
	);

	// Everything from here on is inside the try: constructing or appending the
	// interstitial used to sit outside it, so a throw there skipped the mount
	// entirely and left an empty #app with no error anywhere.
	try {
		document.body.append(interstitial);
		interstitial.showModal();

		if (await healStaleClientState()) {
			interstitial.$.state.status = "Updating to the latest version...";
			location.reload();
			return;
		}

		await boot(interstitial);
	} catch (e) {
		console.error("Failed to start:", e);
		interstitial.$.state.error = messageFor(e);
		interstitial.$.state.hint = hintForError(e);
		interstitial.$.state.phase = "error";
		reportBootStatus("error", messageFor(e));
		// Deliberately left open and modal: it now shows the error and a retry
		// button, which is the only interactive thing left worth doing.
		return;
	}

	try {
		interstitial.close();
		interstitial.remove();
	} catch {
		// Non-fatal; never block the mount on teardown of the dialog.
	}

	await mount();
}

void main();

// Deliberately no `controller` export. It was a live binding that read as
// undefined until boot finished, and every consumer that touched it early
// threw an unhandled TypeError whose only visible symptom was a blank panel.
// Use whenControllerReady() instead.
export { cachePlugin };
