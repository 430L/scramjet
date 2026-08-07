import { serverTest } from "../testcommon.ts";

function refreshNavigationServerTest(props: { name: string; content: string }) {
	return serverTest({
		name: props.name,
		start: async (server, _port, { pass }) => {
			let seenRefreshRequest = false;
			server.on("request", (req, res) => {
				if (req.url === "/") {
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end(`
						<!doctype html>
						<html>
							<head>
								<meta http-equiv="refresh" content="${props.content}">
							</head>
							<body>ok</body>
						</html>
					`);
					return;
				}

				if (req.url === "/next/page.html") {
					seenRefreshRequest = true;
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end("<!doctype html><html><body>next</body></html>");
					pass("refresh navigation reached origin server");
					return;
				}

				if (req.url === "/favicon.ico") {
					res.writeHead(204);
					res.end();
					return;
				}

				res.writeHead(404, { "Content-Type": "text/plain" });
				res.end("Not found");
			});
		},
		autoPass: false,
	});
}

// The `Refresh:` *response header* shares the declarative-refresh grammar with
// `<meta http-equiv="refresh">`, but its URL is frequently BARE (no `url=`).
// The proxy must rewrite it the same way; a passed-through bare header would
// send the browser to the raw target and expose the origin in the address bar.
function refreshHeaderNavigationServerTest(props: {
	name: string;
	header: string;
}) {
	return serverTest({
		name: props.name,
		start: async (server, _port, { pass }) => {
			server.on("request", (req, res) => {
				if (req.url === "/") {
					res.writeHead(200, {
						"Content-Type": "text/html",
						Refresh: props.header,
					});
					res.end(
						"<!doctype html><html><head></head><body>ok</body></html>"
					);
					return;
				}

				if (req.url === "/next/page.html") {
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end("<!doctype html><html><body>next</body></html>");
					pass("refresh-header navigation reached origin server");
					return;
				}

				if (req.url === "/favicon.ico") {
					res.writeHead(204);
					res.end();
					return;
				}

				res.writeHead(404, { "Content-Type": "text/plain" });
				res.end("Not found");
			});
		},
		autoPass: false,
	});
}

export default [
	refreshNavigationServerTest({
		name: "rewriter-refresh-lowercase-url-label",
		content: "5; url=/next/page.html",
	}),
	refreshNavigationServerTest({
		name: "rewriter-refresh-uppercase-url-label",
		content: "5; URL=/next/page.html",
	}),
	refreshNavigationServerTest({
		name: "rewriter-refresh-quoted-url",
		content: "0; URL='/next/page.html'",
	}),
	// Response-header variants. The bare-URL case is the regression: the old
	// `url=`-only regex passed it through unrewritten.
	refreshHeaderNavigationServerTest({
		name: "rewriter-refresh-header-bare-url",
		header: "0; /next/page.html",
	}),
	refreshHeaderNavigationServerTest({
		name: "rewriter-refresh-header-url-label",
		header: "0; url=/next/page.html",
	}),
	serverTest({
		name: "rewriter-refresh-time-only",
		start: async (server) => {
			server.on("request", (req, res) => {
				if (req.url === "/") {
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end(`
						<!doctype html>
						<html>
							<head>
								<meta http-equiv="refresh" content="300">
							</head>
							<body>
								<script>
									const meta = document.querySelector('meta[http-equiv="refresh" i]');
									const actual = meta?.getAttribute("content") || "";
									if (actual === "300") {
										__testPass("time-only refresh unchanged");
									} else {
										__testFail("time-only refresh should be unchanged", { actual, expected: "300" });
									}
								</script>
							</body>
						</html>
					`);
					return;
				}

				res.writeHead(404, { "Content-Type": "text/plain" });
				res.end("Not found");
			});
		},
	}),
];
