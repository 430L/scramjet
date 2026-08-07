import { css, type Component } from "dreamland/core";

// The boot interstitial doubles as the boot *error* surface.
//
// It is a modal <dialog>, which means that while it is open the rest of the
// page is inert — nothing behind it can be clicked. That is fine while we are
// genuinely loading, and fatal if we ever get stuck: a modal dialog with no
// visible content is indistinguishable from a hung page. So this component
// always renders something, and in the error phase it renders a way out.
const LoadInterstitial: Component<{
	status: string;
	phase: "loading" | "error";
	error: string;
	hint: string;
	onRetry: () => void;
}> = function () {
	this.phase ??= "loading";
	this.error ??= "";
	this.hint ??= "";

	// Both panes are always in the DOM and toggled with a class, rather than
	// swapped by a reactive map. Keeping the reactive bindings at the top
	// level of the component is the pattern the rest of this app uses, and it
	// means the error pane cannot fail to render at the exact moment it is
	// needed most.
	return (
		<dialog
			class={use(this.phase).map((phase) => `boot phase-${phase}`)}
		>
			<div class="pane loading-pane">
				<h1>Loading</h1>
				<div class="spinner" aria-hidden="true"></div>
				<p class="detail">{use(this.status)}</p>
				<p class="hint">{use(this.hint)}</p>
			</div>
			<div class="pane error-pane">
				<h1>Couldn't start</h1>
				<p class="detail">{use(this.error)}</p>
				<p class="hint">{use(this.hint)}</p>
				<button type="button" on:click={() => this.onRetry?.()}>
					Try again
				</button>
			</div>
		</dialog>
	);
};

LoadInterstitial.style = css`
	:scope {
		/* Match the app chrome. An unstyled dialog is white-on-white, which is
		   why a stalled boot used to read as a blank page. */
		background: #0f0f0f;
		color: #e5e7eb;
		border: 1px solid #2a2a2a;
		border-radius: 10px;
		padding: 0;
		width: min(30em, calc(100vw - 2em));
		max-width: calc(100vw - 2em);
		font-family: system-ui, -apple-system, sans-serif;
	}
	:scope::backdrop {
		background: #050505;
		backdrop-filter: blur(3px);
	}
	.pane {
		display: none;
		flex-direction: column;
		align-items: center;
		gap: 0.75em;
		padding: 2em 1.75em;
		text-align: center;
	}
	:scope.phase-loading .loading-pane,
	:scope.phase-error .error-pane {
		display: flex;
	}
	h1 {
		margin: 0;
		font-size: 1.35em;
		font-weight: 600;
		color: #f3f4f6;
	}
	.detail {
		margin: 0;
		font-size: 0.9em;
		color: #b8bcc4;
		/* Error text can be a long URL or an exception message. */
		overflow-wrap: anywhere;
	}
	.hint {
		margin: 0;
		font-size: 0.8em;
		color: #8f8f8f;
		overflow-wrap: anywhere;
	}
	.hint:empty {
		display: none;
	}
	button {
		margin-top: 0.25em;
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		color: #e5e7eb;
		padding: 0.6em 1.4em;
		border-radius: 6px;
		font-size: 0.95em;
		font-family: inherit;
		cursor: pointer;
	}
	button:hover {
		background: #222;
	}
	.spinner {
		width: 1.6em;
		height: 1.6em;
		border: 2px solid #2a2a2a;
		border-top-color: #8f8f8f;
		border-radius: 50%;
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	/* Respect reduced-motion: keep the element as a static ring. */
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
`;

export default LoadInterstitial;
