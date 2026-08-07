import { serverTest } from "../testcommon.ts";

// Regression: a redirect *status* does not guarantee a `Location` header. A
// bare 304 Not Modified, or a malformed 3xx, can arrive without one. The
// proxy's redirect handling matches the whole 300-399 range, so it must not
// assume `Location` is present — otherwise it constructs `new URL(null)`,
// throws, and aborts the proxied response entirely (a hard failure, strictly
// worse than passing the response through).
export default [
	serverTest({
		name: "redirect-without-location-does-not-throw",
		start: async (server) => {
			server.on("request", (req, res) => {
				if (req.url === "/") {
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end(`
						<!doctype html>
						<html>
							<head></head>
							<body>
								<script>
									(async () => {
										try {
											// redirect: "manual" so the browser returns the
											// proxy's 3xx response as-is instead of trying to
											// follow it; we only care that the proxy produced a
											// response rather than throwing.
											const r = await fetch("/redirect-no-location", {
												redirect: "manual",
											});
											__testPass(
												"Location-less redirect handled (type=" +
													r.type +
													", status=" +
													r.status +
													")"
											);
										} catch (e) {
											__testFail(
												"fetch threw on a Location-less redirect: " + e
											);
										}
									})();
								</script>
							</body>
						</html>
					`);
					return;
				}

				if (req.url === "/redirect-no-location") {
					// 3xx with NO Location header.
					res.writeHead(302, { "Content-Type": "text/plain" });
					res.end("no location");
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
	}),
];
