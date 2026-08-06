import { AkClient } from "@client/index";

/**
 * Middle-click / modifier-click hijacker.
 *
 * When confineNavigation is on, the runtime already strips target=_blank and
 * rewrites window.open to an in-frame navigation. Neither of those covers a
 * user physically opening a rewritten anchor in a new tab via middle-click,
 * ctrl-click, cmd-click, or shift-click — the browser walks the anchor's own
 * (already-rewritten) `href` and opens it as a top-level tab, exposing the
 * raw proxy origin.
 *
 * We intercept those clicks in the capture phase, cancel the browser's own
 * navigation, and navigate the current frame to the same URL. The user's
 * tab count stays constant and the outer trampoline tab (sandboxed by the
 * launcher HTML) stays on about:blank.
 *
 * The docstring on confineNavigation in types.ts already claims this
 * behavior; this module is the implementation.
 */
export default function (client: AkClient, self: typeof window) {
	if (!client.flagEnabled("confineNavigation")) return;
	if (!("document" in self)) return;

	const handler = (event: MouseEvent) => {
		// Only care about new-tab / new-window shapes:
		//   middle mouse (button 1), ctrl/cmd/shift modifier on left click.
		const isMiddle = event.button === 1;
		const isModified = event.ctrlKey || event.metaKey || event.shiftKey;
		if (!isMiddle && !isModified) return;
		if (event.defaultPrevented) return;

		// composedPath handles the shadow-DOM case where event.target is
		// not the anchor itself. Fall back to closest("a,area") if the
		// engine hides the path.
		let anchor: HTMLAnchorElement | HTMLAreaElement | null = null;
		const path =
			typeof event.composedPath === "function" ? event.composedPath() : [];
		for (const node of path as EventTarget[]) {
			if (!node || typeof (node as any).tagName !== "string") continue;
			const tag = (node as HTMLElement).tagName;
			if (tag === "A" || tag === "AREA") {
				anchor = node as HTMLAnchorElement | HTMLAreaElement;
				break;
			}
		}
		if (!anchor) {
			const t = event.target as Element | null;
			if (t && typeof t.closest === "function") {
				anchor = t.closest("a,area") as
					| HTMLAnchorElement
					| HTMLAreaElement
					| null;
			}
		}
		if (!anchor) return;

		// Read the href from the native descriptor — the property getter is
		// trapped to un-rewrite for the site, and we want the actual (already
		// rewritten) attribute so navigation stays on the proxy origin.
		let href: string;
		try {
			href = client.natives.call(
				"Element.prototype.getAttribute",
				anchor,
				"href"
			) as string;
		} catch {
			return;
		}
		if (!href) return;

		event.preventDefault();
		event.stopPropagation();
		// Same-frame navigation. Since href is already a rewritten proxy URL,
		// this loads the destination inside the current proxy frame instead
		// of opening a new top-level tab exposing the proxy origin.
		self.location.href = href;
	};

	// Capture phase so this runs before any site-installed click handler
	// that might otherwise stopPropagation the event.
	self.document.addEventListener("click", handler, true);
	self.document.addEventListener("auxclick", handler, true);
}
