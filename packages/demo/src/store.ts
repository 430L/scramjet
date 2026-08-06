import { createStore } from "dreamland/core";

export type AvailableTransports = "libcurl" | "epoxy";

export const AVAILABLE_TRANSPORTS: ReadonlyArray<{
	value: AvailableTransports;
	label: string;
}> = [
	{ value: "libcurl", label: "Libcurl" },
	{ value: "epoxy", label: "Epoxy" },
];
const DEFAULT_WISP_URL = import.meta.env.VITE_WISP_URL;
const DEFAULT_TRANSPORT: AvailableTransports = "libcurl";
// Show an empty URL bar on first load rather than auto-populating a real
// hostname; the placeholder text guides the user. Auto-filling a well-known
// domain (google.com, etc.) is a hint that this is a proxy landing page and
// tends to be an early input to categorizer feature vectors.
const DEFAULT_HOME_URL = "";
const DEFAULT_MAX_REQUESTS = 200;

export const demoSettingsStore = createStore(
	{
		transport: DEFAULT_TRANSPORT as AvailableTransports,
		wispUrl: DEFAULT_WISP_URL,
		homeUrl: DEFAULT_HOME_URL,
		maxRequests: DEFAULT_MAX_REQUESTS,
	},
	{
		ident: "ak-app-settings",
		backing: "localstorage",
		autosave: "auto",
	}
);

export function normalizeWispUrl(value: string) {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new TypeError("Wisp URL is required.");
	}

	let normalized = trimmed;
	if (!normalized.startsWith("ws://") && !normalized.startsWith("wss://")) {
		normalized = `ws://${normalized}`;
	}

	const parsed = new URL(normalized);
	if (!parsed.pathname || parsed.pathname === "") {
		parsed.pathname = "/";
	}
	if (!parsed.pathname.endsWith("/")) {
		parsed.pathname = `${parsed.pathname}/`;
	}

	return parsed.toString();
}

export function normalizeHomeUrl(value: string) {
	const trimmed = value.trim();
	// Empty is allowed and means "no home URL" — the URL bar starts empty.
	if (!trimmed) return "";

	const normalized = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	return new URL(normalized).toString();
}

export function normalizeTransport(value: string): AvailableTransports {
	if (AVAILABLE_TRANSPORTS.some((t) => t.value === value)) {
		return value as AvailableTransports;
	}
	throw new TypeError(`Unknown transport: ${value}`);
}

export function normalizeMaxRequests(value: string | number) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new TypeError("Request log limit must be a number.");
	}

	const rounded = Math.round(parsed);
	if (rounded < 10 || rounded > 5000) {
		throw new RangeError("Request log limit must be between 10 and 5000.");
	}

	return rounded;
}

export const demoSettingsDefaults = {
	wispUrl: normalizeWispUrl(DEFAULT_WISP_URL),
	transport: DEFAULT_TRANSPORT,
	homeUrl: normalizeHomeUrl(DEFAULT_HOME_URL),
	maxRequests: DEFAULT_MAX_REQUESTS,
};
