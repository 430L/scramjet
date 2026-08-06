/**
 * Version information for the current Ak build.
 * Contains both the semantic version string and the git commit hash for build identification.
 */
export interface AkVersionInfo {
	/** The semantic version */
	version: string;
	/** The git commit hash that this build was created from */
	build: string;
	/** The date of the build */
	date: string;
}

/**
 * Ak Feature Flags, configured at build time
 */
export type AkFlags = {
	syncxhr: boolean;
	disableComputedWrap: boolean;
	rewriterLogs: boolean;
	captureErrors: boolean;
	cleanErrors: boolean;
	scramitize: boolean;
	sourcemaps: boolean;
	destructureRewrites: boolean;
	allowInvalidJs: boolean;
	allowFailedIntercepts: boolean;
	debugTrampolines: boolean;
	debugSourceURL: boolean;
	encapsulateWorkers: boolean;
	/**
	 * When true, every navigation stays inside the current proxy frame:
	 * - target="_blank"/_new on <a>/<form> is stripped so links load in place.
	 * - window.open(url, ...) becomes self.location = rewritten(url).
	 * - Middle-click / ctrl-click new-tab is prevented.
	 * Use this when the proxy is embedded (e.g. an about:blank trampoline
	 * iframe) and any new tab or top-level navigation would break the
	 * embed. Also removes the need for the CatchEscapedLinksPlugin 302,
	 * which was the primary redirect vector for embedded setups.
	 */
	confineNavigation: boolean;
};

export interface AkConfig {
	globals: {
		wrapfn: string;
		wrappropertybase: string;
		wrappropertyfn: string;
		cleanrestfn: string;
		importfn: string;
		rewritefn: string;
		metafn: string;
		wrappostmessagefn: string;
		pushsourcemapfn: string;
		trysetfn: string;
		templocid: string;
		tempunusedid: string;
	};
	flags: AkFlags;
	siteFlags: Record<string, Partial<AkFlags>>;
	maskedfiles: string[];
	/**
	 * If non-empty, every proxied document's <title> (both the initial HTML
	 * <title> element and later writes via document.title) is replaced with
	 * this string. Extensions that classify a tab by its document title —
	 * a common content-filter path — see this constant instead of the
	 * target site's actual title.
	 * Set to an empty string to disable and pass the real title through.
	 */
	spoofedTitle: string;
}

/**
 * The config for Ak initialization.
 */
export interface AkInitConfig
	extends Omit<AkConfig, "codec" | "flags"> {
	flags: Partial<AkFlags>;
	codec: {
		encode: (url: string) => string;
		decode: (url: string) => string;
	};
}

//eslint-disable-next-line
export type AnyFunction = Function;
