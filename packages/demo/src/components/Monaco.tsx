import { css, type Component } from "dreamland/core";

// Monaco is loaded on demand, not at module scope.
//
// `monaco-editor/esm/vs/editor/editor.main.js` is several megabytes of
// JavaScript. Importing it statically pulled it into the app's entry chunk,
// which meant the browser had to download and fully evaluate all of it before
// the first paint of a page that, in the common case, never shows an editor at
// all — the editor only appears behind the Requests and Playground tabs. On a
// cold start against a sleeping host that dominated time-to-interactive, and
// any exception thrown while evaluating it took down the whole app rather than
// just the editor.
//
// Keeping the import dynamic means the entry chunk no longer contains Monaco;
// it is fetched the first time an editor actually mounts.

type MonacoApi = typeof import("monaco-editor/esm/vs/editor/editor.api");

let monacoPromise: Promise<MonacoApi> | null = null;

function loadMonaco(): Promise<MonacoApi> {
	if (monacoPromise) return monacoPromise;

	monacoPromise = (async () => {
		// Must be set before editor.main.js evaluates. Monaco would otherwise
		// try to spawn web workers from a URL that doesn't exist here; the
		// empty data: URL makes it fall back to running in the main thread.
		if (!(globalThis as any).MonacoEnvironment) {
			(globalThis as any).MonacoEnvironment = {
				getWorkerUrl() {
					return "data:application/javascript,";
				},
			};
		}

		const api = await import("monaco-editor/esm/vs/editor/editor.api");
		// Side-effect import: registers the languages, themes and editor
		// contributions that editor.api only declares. Ships no type
		// declarations of its own.
		// @ts-expect-error - untyped module
		await import("monaco-editor/esm/vs/editor/editor.main.js");
		return api;
	})();

	// A failed load must not be cached as a permanent failure — switching
	// tabs again should retry rather than showing a stale error forever.
	monacoPromise.catch(() => {
		monacoPromise = null;
	});

	return monacoPromise;
}

type MonacoProps = {
	value: string;
	language?: string;
	readOnly?: boolean;
	minHeight?: number;
	fill?: boolean;
	onChange?: (value: string) => void;
	onSave?: () => void;
};

const Monaco: Component<
	MonacoProps,
	{},
	{ instance?: any; loadError: string }
> = function (cx) {
	this.loadError = "";

	cx.mount = async () => {
		let monaco: MonacoApi;
		try {
			monaco = await loadMonaco();
		} catch (e) {
			console.error("Failed to load the code editor:", e);
			this.loadError =
				e instanceof Error ? e.message : "Failed to load the code editor.";
			return;
		}

		this.instance = monaco.editor.create(cx.root, {
			value: this.value ?? "",
			language: this.language ?? "plaintext",
			readOnly: this.readOnly ?? true,
			automaticLayout: true,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			lineNumbers: "on",
			renderLineHighlight: "none",
			theme: "vs-dark",
		});

		this.instance.onDidChangeModelContent(() => {
			this.onChange?.(this.instance.getValue());
		});

		this.instance.addCommand(
			monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
			() => {
				this.onSave?.();
			}
		);

		use(this.value).listen((next) => {
			if (!this.instance) return;
			const current = this.instance.getValue();
			if (current !== next) {
				this.instance.setValue(next ?? "");
			}
		});

		use(this.language).listen((next) => {
			if (!this.instance || !this.instance.getModel()) return;
			monaco.editor.setModelLanguage(
				this.instance.getModel(),
				next ?? "plaintext"
			);
		});

		use(this.readOnly).listen((next) => {
			if (!this.instance) return;
			this.instance.updateOptions({ readOnly: next ?? true });
		});
	};

	return (
		<div
			class={`monaco-host ${this.fill ? "fill" : ""}`}
			style={
				this.fill
					? "min-height: 0; height: 100%;"
					: `min-height: ${this.minHeight ?? 260}px; height: ${this.minHeight ?? 260}px;`
			}
		>
			<div class={use(this.loadError).map((e) => `load-error ${e ? "shown" : ""}`)}>
				{use(this.loadError)}
			</div>
		</div>
	);
};

Monaco.style = css`
	:scope {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
		min-height: 200px;
		height: auto;
		flex: 0 0 auto;
		border-radius: 0;
		overflow: hidden;
		border: 0;
		background: #111;
	}
	:scope.fill {
		flex: 1;
		height: 100%;
		min-height: 0;
	}
	.monaco-host {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
		min-height: 200px;
		height: 100%;
	}
	.monaco-host.fill {
		min-height: 0;
	}
	.load-error {
		display: none;
	}
	.load-error.shown {
		display: block;
		padding: 1em;
		color: #b8bcc4;
		font-family: system-ui, -apple-system, sans-serif;
		font-size: 0.9em;
		overflow-wrap: anywhere;
	}
`;
export default Monaco;
