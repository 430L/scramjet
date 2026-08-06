export const REGISTRY_URL = "https://registry.npmjs.org/";
export const SCRAMJET_PACKAGE_NAME = "@mercuryworkshop/scramjet";

export const SCRAMJET_CONTROLLER_PACKAGE_NAME =
	"@mercuryworkshop/scramjet-controller";
export const SCRAMJET_CONTROLLER_PINNED_MAJOR_VERSION = "0";

export const SCRAMJET_UTILS_PACKAGE_NAME = "@mercuryworkshop/scramjet-utils";
export const SCRAMJET_UTILS_PINNED_MAJOR_VERSION = "0";

export const EPOXY_TRANSPORT_PACKAGE_NAME = "@mercuryworkshop/epoxy-transport";
export const EPOXY_TRANSPORT_PINNED_MAJOR_VERSION = "3";

export const LIBCURL_TRANSPORT_PACKAGE_NAME =
	"@mercuryworkshop/libcurl-transport";
export const LIBCURL_TRANSPORT_PINNED_MAJOR_VERSION = "2";

export type TransportOptions = "epoxy" | "libcurl" | "bare";

export type BootstrapOptions = {
	transport: TransportOptions;
	swPath: string;

	wispPath: string;

	scramjetBundlePath: string;
	scramjetWasmPath: string;
	scramjetUtilsBundlePath: string;

	epoxyClientPath: string;
	libcurlClientPath: string;
	bareClientPath: string;
	scramjetControllerApiPath: string;
	scramjetControllerInjectPath: string;
	scramjetControllerSwPath: string;

	bootstrapApiPath: string;
	bootstrapInitPath: string;

	scramjetVersionPin?: string;
	scramjetControllerVersionPin?: string;
	scramjetUtilsVersionPin?: string;
	epoxyTransportVersionPin?: string;
	libcurlTransportVersionPin?: string;
	bareTransportVersionPin?: string;
};

export const defaultConfig: Partial<BootstrapOptions> = {
	transport: "libcurl",
	swPath: "/sw.js",
	// Non-fingerprintable websocket path. Change to rotate if a deployment
	// starts getting flagged for the URL alone.
	wispPath: "/api/socket/",

	epoxyClientPath: "/static/vendor/ep-client.js",
	libcurlClientPath: "/static/vendor/lc-client.js",
	bareClientPath: "/static/vendor/br-client.js",
	bootstrapInitPath: "/static/chunks/boot.js",

	// Paths are deliberately named to blend in with a typical bundled SPA
	// (Next.js/Vite-style /static/chunks) rather than a proxy tuple that
	// tips off pattern-matching filters.
	scramjetControllerApiPath: "/static/chunks/framework.js",
	scramjetControllerInjectPath: "/static/chunks/polyfills.js",
	scramjetControllerSwPath: "/static/chunks/webpack.js",
	scramjetBundlePath: "/static/chunks/main.js",
	scramjetWasmPath: "/static/chunks/main.wasm",
	scramjetUtilsBundlePath: "/static/chunks/vendor.js",
};
