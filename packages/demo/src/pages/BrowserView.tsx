import {
	css,
	type Delegate,
	type Component,
	createState,
} from "dreamland/core";
import { UrlWatcherPlugin } from "@mercuryworkshop/scramjet-utils";
import { versionInfo } from "@mercuryworkshop/scramjet";
import { cachePlugin, whenControllerReady } from "..";
import { demoSettingsStore } from "../store";
import homepage from "./homepage.html?raw";
import type { Frame } from "@mercuryworkshop/scramjet-controller";

export const browserState = createState({
	url: demoSettingsStore.homeUrl,
	frame: null! as Frame,
});

export const Omnibox: Component = function (cx) {
	const navigate = () => {
		if (!browserState.url.trim()) return;
		if (!browserState.url.startsWith("http")) {
			browserState.url = `https://${browserState.url}`;
		}
		demoSettingsStore.homeUrl = browserState.url;
		browserState.frame?.go(browserState.url);
	};
	return (
		<form
			class="url-form"
			on:submit={(e: SubmitEvent) => {
				e.preventDefault();
				navigate();
			}}
		>
			<div class="browser-omnibox-shell">
				<div class="omnibox-nav" aria-hidden="true">
					<button
						type="button"
						class="nav-btn"
						on:click={() => browserState.frame?.back()}
					>
						<span class="material-symbols-outlined">arrow_back</span>
					</button>
					<button
						type="button"
						class="nav-btn"
						on:click={() => browserState.frame?.forward()}
					>
						<span class="material-symbols-outlined">arrow_forward</span>
					</button>
					<button
						type="button"
						class="nav-btn"
						on:click={() => browserState.frame?.reload()}
					>
						<span class="material-symbols-outlined">refresh</span>
					</button>
				</div>
				<input
					id="search"
					class="url-input"
					type="text"
					value={use(browserState.url)}
					spellcheck="false"
					placeholder="Enter URL or search..."
				/>
			</div>
		</form>
	);
};
Omnibox.style = css`
	:scope {
		display: flex;
		align-items: center;
		/*padding: 0.25em 0.45em;*/
		background: #0f0f0f;
		border-bottom: 1px solid #2a2a2a;
		min-width: 0;
		width: 100%;
	}
	.browser-omnibox-shell {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.35em;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0;
		flex: 1;
	}
	.omnibox-nav {
		display: flex;
		align-items: center;
		gap: 0.15em;
		padding-right: 0.25em;
		border-right: 1px solid #2a2a2a;
	}
	.nav-btn {
		border: 0;
		background: transparent;
		color: #8f8f8f;
		width: 1.5em;
		height: 1.5em;
		padding: 0;
		border-radius: 3px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.nav-btn:hover {
		background: #1f1f1f;
		color: #d0d0d0;
	}
	.browser-omnibox-shell .material-symbols-outlined {
		font-size: 15px !important;
		line-height: 1 !important;
		font-variation-settings:
			"OPSZ" 20,
			"wght" 300,
			"FILL" 0,
			"GRAD" 0;
	}
	.url-input {
		box-sizing: border-box;
		width: 100%;
		padding: 0.22em 0.18em;
		font-size: 0.9em;
		border: 1px solid transparent;
		border-radius: 3px;
		background: transparent;
		color: #e5e7eb;
		outline: none;
	}
	.url-input::placeholder {
		color: #6f7680;
	}
`;

const BrowserView: Component<
	{
		active: boolean;
	},
	{},
	{
		frameel: HTMLIFrameElement;
		error: string;
	}
> = function (cx) {
	this.error ??= "";

	cx.mount = async () => {
		try {
			await mountFrame();
		} catch (e) {
			// Without this the failure is an unhandled rejection and the iframe
			// simply never gets a src — a black panel under the top bar with no
			// clue as to why. Surface it in the panel instead.
			console.error("Failed to initialise the browser view:", e);
			this.error = e instanceof Error ? e.message : String(e);
		}
	};

	const mountFrame = async () => {
		const controller = await whenControllerReady();

		let urlWatcher = new UrlWatcherPlugin((url) => {
			browserState.url = url;
		});
		// CatchEscapedLinksPlugin is intentionally NOT installed: it returned
		// a 302 to <origin>/?goto=<url> for every top-level (document-dest)
		// navigation, which becomes a real top-level browser navigation. That
		// broke embedded setups (e.g. an about:blank trampoline iframe hosting
		// the proxy) — the trampoline itself would follow the redirect and
		// expose the underlying origin. The confineNavigation flag on the
		// runtime config instead keeps every navigation inside the proxy
		// frame (target=_blank stripped, window.open becomes in-frame nav).
		browserState.frame = controller.createFrame(this.frameel, {
			plugins: [cachePlugin, urlWatcher],
		});
		let realHomepage = homepage;
		realHomepage = realHomepage.replaceAll(
			"{{APP_VERSION}}",
			String(versionInfo.version)
		);
		realHomepage = realHomepage.replaceAll(
			"{{APP_BUILD}}",
			String(versionInfo.build)
		);
		// Pinned to en-US rather than the visitor's locale. Two reasons: the
		// build date is a property of the build, not of the reader, so it
		// should render identically everywhere; and a locale-dependent string
		// rendered into the page is one more bit a fingerprinter can read back.
		realHomepage = realHomepage.replaceAll(
			"{{APP_DATE_PRETTY}}",
			new Date(versionInfo.date).toLocaleString("en-US", {
				dateStyle: "short",
				timeStyle: "short",
			})
		);
		// percent-encoding, not base64. btoa() throws InvalidCharacterError on
		// any codepoint above U+00FF, so a homepage containing non-Latin-1
		// text — or a locale-formatted date, which is how this used to break —
		// would take out the whole panel for those visitors only.
		this.frameel.src = `data:text/html;charset=utf-8,${encodeURIComponent(realHomepage)}`;
	};

	return (
		<div
			class={use(this.active).map(
				(active) => `tab-panel browser-view ${active ? "active" : ""}`
			)}
		>
			{/* The iframe is an unconditional child: it must never be swapped
			    out by a reactive re-render, or a later state change would
			    silently replace the live frame with a fresh blank one. The
			    error state is an overlay stacked on top of it instead. */}
			<iframe this={use(this.frameel)}></iframe>
			<div
				class={use(this.error).map(
					(error) => `panel-error ${error ? "shown" : ""}`
				)}
			>
				<h2>The browser panel failed to start</h2>
				<p>{use(this.error)}</p>
				<button type="button" on:click={() => location.reload()}>
					Reload
				</button>
			</div>
		</div>
	);
};

BrowserView.style = css`
	:scope {
		flex: 1;
		width: 100%;
		min-width: 0;
		min-height: 0;
		display: none;
		flex-direction: column;
	}
	:scope.active {
		display: flex;
		/* Anchor for the error overlay. */
		position: relative;
	}

	iframe {
		background: white;
		flex: 1;
		border: none;
	}

	.panel-error {
		display: none;
	}
	.panel-error.shown {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75em;
		padding: 2em;
		text-align: center;
		background: #0f0f0f;
		color: #e5e7eb;
		font-family: system-ui, -apple-system, sans-serif;
	}
	.panel-error h2 {
		margin: 0;
		font-size: 1.15em;
		font-weight: 600;
	}
	.panel-error p {
		margin: 0;
		font-size: 0.9em;
		color: #b8bcc4;
		max-width: 34em;
		overflow-wrap: anywhere;
	}
	.panel-error button {
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		color: #e5e7eb;
		padding: 0.6em 1.4em;
		border-radius: 6px;
		font-size: 0.95em;
		font-family: inherit;
		cursor: pointer;
	}
	.panel-error button:hover {
		background: #222;
	}
`;

export default BrowserView;
