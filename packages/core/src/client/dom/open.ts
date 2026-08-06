import { AkClient } from "@client/index";
import { AKCLIENT } from "@/symbols";
import { String } from "@/shared/snapshot";

export default function (client: AkClient) {
	client.Proxy("window.open", {
		apply(ctx) {
			// When confineNavigation is on, never call the real window.open —
			// a new top-level browsing context escapes any embedded proxy shell
			// (e.g. an about:blank trampoline iframe) and exposes the raw
			// proxy origin. Handles every argument shape, including
			// window.open("", "_top") and window.open(undefined, "_blank"),
			// which would otherwise slip past a URL-non-empty gate and reach
			// the real window.open.
			if (client.flagEnabled("confineNavigation")) {
				if (typeof ctx.args[0] !== "undefined") {
					const url = String(ctx.args[0]);
					if (url !== "") {
						// Navigate the current window in place. self.location
						// here is the scramjet client's native location since
						// the client runs on unwrapped globals.
						self.location.href = client.rewriteUrl(url);
					}
				}
				// If only a target is given (open("", "_blank"), etc.), the
				// caller wants a new browsing context named `target`. Denying
				// the new context and returning the current window matches the
				// about:blank-window semantic without leaking the origin.
				return ctx.return(self);
			}

			// undefined opens an about:blank window, pass through
			if (typeof ctx.args[0] !== "undefined") {
				const url = String(ctx.args[0]);
				// blank also opens an about:blank window
				if (url !== "") {
					// note that null or anything else will *not* open an about:blank window
					ctx.args[0] = client.rewriteUrl(url);
				}
			}

			if (typeof ctx.args[1] !== "undefined" && ctx.args[1] !== null) {
				let target = String(ctx.args[1]);

				if (target === "_top" || target === "_unfencedTop") {
					target = client.meta.topFrameName;
				}
				if (target === "_parent") {
					target = client.meta.parentFrameName;
				}

				ctx.args[1] = target;
			}

			const realwin = ctx.call();

			if (!realwin) return ctx.return(realwin);

			if (!(AKCLIENT in realwin)) {
				// i don't believe it's possible for a just-opened window to already have scramjet loaded but just in case
				client.init.hookSubcontext(realwin);
			}

			return realwin;
		},
	});

	client.Trap("window.frameElement", {
		get(ctx) {
			const f = ctx.get() as HTMLIFrameElement | null;
			if (!f) return f;

			const win = f.ownerDocument.defaultView;
			if (win[AKCLIENT]) {
				// then this is a subframe in a scramjet context, and it's safe to pass back the real iframe
				return f;
			} else {
				// no, the top frame is outside the sandbox
				return null;
			}
		},
	});
}
