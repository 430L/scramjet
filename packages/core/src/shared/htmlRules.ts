import { rewriteCss } from "@rewriters/css";
import { rewriteHtml, rewriteSrcset } from "@rewriters/html";
import { rewriteUrl, unrewriteBlob, URLMeta } from "@rewriters/url";
import { AkContext, flagEnabled } from "@/shared";
import { _URL } from "./snapshot";

// Sandbox tokens that let iframe content change the ancestor tab's URL or open
// a new top-level browsing context. When confineNavigation is on we always
// merge these OUT of any incoming iframe sandbox so nested iframes inside a
// proxied page can't be used as an escape vector.
const FORBIDDEN_SANDBOX_TOKENS = [
	"allow-top-navigation",
	"allow-top-navigation-by-user-activation",
	"allow-top-navigation-to-custom-protocols",
	"allow-popups",
	"allow-popups-to-escape-sandbox",
];

/**
 * Apply the confineNavigation `target` filter to a value coming from either
 * an HTML attribute (`<a target="…">`) or an element property setter
 * (`a.target = "…"`, `form.target = "…"`, `input.formTarget = "…"`, …).
 *
 * Returns `null` when the value would break out of the current frame and must
 * be dropped; returns a possibly-remapped string otherwise. Callers that
 * receive `null` should treat it as "attribute removed" (setAttribute path)
 * or "coerce the property to `""`" (property-setter path).
 */
export function filterTarget(
	value: string,
	context: AkContext,
	meta: URLMeta
): string | null {
	// When confineNavigation is on, ANY target that isn't the current frame
	// escapes — hardcoded names like _blank/_top/_parent open a new tab or an
	// ancestor context, and arbitrary named targets like "mywindow" or "_new2"
	// open a NEW top-level browsing context loading the raw proxy URL. Strip
	// everything except the two forms that stay in the current frame: an
	// empty string and the reserved "_self" keyword.
	if (
		flagEnabled("confineNavigation", context, meta.base) &&
		value !== "" &&
		value !== "_self"
	) {
		return null;
	}
	if (value === "_top" || value === "_unfencedTop") return meta.topFrameName;
	else if (value === "_parent") return meta.parentFrameName;
	else return value;
}

/**
 * Apply the confineNavigation policy to an iframe sandbox attribute value.
 * Merges the forbidden tokens out of the incoming value rather than dropping
 * the attribute entirely. Preserves the site's own restrictions and adds
 * ours on top; an incoming `undefined`/`""` still returns a restrictive
 * sandbox rather than removing the attribute (which would grant *more*
 * permissions than the site asked for).
 */
export function filterSandbox(
	value: string,
	context: AkContext,
	meta: URLMeta
): string {
	const flagOn = flagEnabled("confineNavigation", context, meta.base);
	// Whitespace-split per the HTML spec's ASCII whitespace set.
	const tokens = (value || "")
		.split(/[\t\n\f\r ]+/)
		.filter((t) => t.length > 0);

	if (!flagOn) {
		// Preserve the site's original sandbox (or lack of one, represented
		// as an empty string) instead of the previous behavior of stripping
		// the whole attribute.
		return tokens.join(" ");
	}

	const forbidden = new Set(FORBIDDEN_SANDBOX_TOKENS.map((t) => t.toLowerCase()));
	const kept = tokens.filter((t) => !forbidden.has(t.toLowerCase()));
	return kept.join(" ");
}

export const htmlRules: {
	[key: string]: "*" | string[] | ((...any: any[]) => string | null);
	fn: (
		value: string,
		context: AkContext,
		meta: URLMeta,
		attrs?: Record<string, string | undefined>
	) => string | null;
}[] = [
	{
		fn: (value, context, meta) =>
			rewriteUrl(value, context, meta, { navigateType: "location" }),

		// url rewrites
		src: ["embed", "img", "frame", "input", "track"],
		href: ["a", "area", "image"],
		data: ["object"],
		action: ["form"],
		formaction: ["button", "input", "textarea", "submit"],
		poster: ["video"],
		"xlink:href": ["image"],
	},
	{
		fn: (value, context, meta, attrs) => {
			const isModule =
				attrs?.type?.toLowerCase() === "module" ||
				attrs?.rel?.toLowerCase() === "modulepreload";

			return rewriteUrl(value, context, meta, {
				isModule,
			});
		},

		src: ["script"],
		href: ["link"],
	},
	{
		fn: (value, context, meta) => {
			const url = rewriteUrl(value, context, meta, {
				topFrame: meta.topFrameName,
				parentFrame: meta.parentFrameName,
				isIframe: "1",
			});

			return url;
		},
		src: ["iframe"],
	},
	{
		// Merge our forbidden tokens out of the incoming sandbox instead of
		// deleting the attribute wholesale. Stripping would remove any
		// site-defined restrictions (widening the surface), and would let a
		// nested proxied iframe declare `allow-top-navigation` and hijack the
		// ancestor tab. Preserving + merging tightens rather than widens.
		fn: (value, context, meta) => filterSandbox(value, context, meta),
		sandbox: ["iframe"],
	},
	{
		fn: (value, context, meta) => {
			if (value.startsWith("blob:")) {
				// for media elements specifically they must take the original blob
				// because they can't be fetch'd
				return unrewriteBlob(value, context, meta);
			}

			return rewriteUrl(value, context, meta);
		},
		src: ["video", "audio", "source"],
	},
	{
		fn: () => "",

		integrity: ["script", "link"],
	},
	{
		fn: () => null,

		// csp stuff that must be deleted
		nonce: "*",
		csp: ["iframe"],
		credentialless: ["iframe"],
	},
	{
		fn: (value, context, meta) => rewriteSrcset(value, context, meta),

		// srcset
		srcset: ["img", "source"],
		imagesrcset: ["link"],
	},
	{
		fn: (value, context, meta) =>
			rewriteHtml(
				value,
				context,
				{
					// for srcdoc origin is the origin of the page that the iframe is on. base and path get dropped
					origin: new _URL(meta.origin.origin),
					base: new _URL(meta.origin.origin),
					topFrameName: meta.topFrameName,
					parentFrameName: meta.parentFrameName,
					referrerPolicy: meta.referrerPolicy,
				},
				{
					loadScripts: true,
					inline: true,
					source: meta.origin.href,
					apisource: "set HTMLIFrameElement.prototype.srcdoc",
				}
			),

		// srcdoc
		srcdoc: ["iframe"],
	},
	{
		fn: (value, context, meta) => rewriteCss(value, context, meta),
		style: "*",
	},
	{
		// When confineNavigation is on, any target that would break out of
		// the current frame collapses to the current frame. This covers the
		// hardcoded keywords AND arbitrary named targets ("mywindow"),
		// which open a NEW top-level browsing context and are equally
		// dangerous for embedded/trampoline setups.
		fn: (value, context, meta) => filterTarget(value, context, meta),
		target: ["a", "base", "form"],
	},
	{
		// formtarget on submit-capable elements has the same escape potential
		// as form.target — a button/input with formtarget="_top" submits into
		// the ancestor tab.
		fn: (value, context, meta) => filterTarget(value, context, meta),
		formtarget: ["button", "input"],
	},
	{
		// svg elements with an href property
		fn: (value, context, meta) => {
			// #id values are not rewritten
			if (value.startsWith("#")) return value;
			return rewriteUrl(value, context, meta);
		},
		href: [
			"use",
			"textPath",
			"mpath",
			"feImage",
			"animate",
			"animateMotion",
			"animateTransform",
			"set",
			"discard",
			"linearGradient",
			"radialGradient",
			"pattern",
			"filter",
		],
	},
];
