import { viteStaticCopy } from "vite-plugin-static-copy";

// Asset paths are deliberately renamed away from the well-known
// "/assets/{app,core}.*" tuple that many content filters use as a proxy
// fingerprint. Files land in /static/chunks/ so they look like an ordinary
// bundled SPA.
//
// Each output file is listed explicitly rather than via a glob-with-rename.
// The scramjet dist directory also contains a `types/` subdirectory (see
// packages/core/package.json's "types" field). A `dist/*` glob sweeps that
// subdirectory in and the rename callback silently no-ops on its name,
// which historically produced deploys where main.js / runtime.api.js were
// missing from the copy — the SPA fallback then served index.html for
// those requests and the browser choked with a SyntaxError. Explicit
// targets fail loud at build time instead.
export default {
	plugins: [
		viteStaticCopy({
			structured: false,
			targets: [
				// scramjet runtime bundles → main.*
				{
					src: "node_modules/@mercuryworkshop/scramjet/dist/scramjet.js",
					dest: "static/chunks",
					rename: "main.js",
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet/dist/scramjet.wasm",
					dest: "static/chunks",
					rename: "main.wasm",
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet/dist/scramjet.mjs",
					dest: "static/chunks",
					rename: "main.mjs",
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet/dist/scramjet_bundled.js",
					dest: "static/chunks",
					rename: "main_bundled.js",
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet/dist/scramjet_bundled.mjs",
					dest: "static/chunks",
					rename: "main_bundled.mjs",
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet/dist/scramjet-external.mjs",
					dest: "static/chunks",
					rename: "main-external.mjs",
				},
				// controller bundles → runtime.*
				{
					src: "node_modules/@mercuryworkshop/scramjet-controller/dist/controller.api.js",
					dest: "static/chunks",
					rename: "runtime.api.js",
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet-controller/dist/controller.inject.js",
					dest: "static/chunks",
					rename: "runtime.inject.js",
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet-controller/dist/controller.sw.js",
					dest: "static/chunks",
					rename: "runtime.sw.js",
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet-controller/dist/controller-external.mjs",
					dest: "static/chunks",
					rename: "runtime-external.mjs",
				},
			],
			watch: {
				reloadPageOnChange: true,
			},
		}),
	],
};
