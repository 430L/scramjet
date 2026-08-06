import { viteStaticCopy } from "vite-plugin-static-copy";

// Asset paths are deliberately renamed away from the well-known
// "/assets/{app,core}.*" tuple that many content filters use as a proxy
// fingerprint. Files land in /static/chunks/ so they look like an ordinary
// bundled SPA. Rotate names via this config if a deployment ever gets
// pattern-flagged.
export default {
	plugins: [
		viteStaticCopy({
			structured: false,
			targets: [
				{
					src: "node_modules/@mercuryworkshop/scramjet/dist/*",
					dest: "static/chunks",
					rename: (fileName, fileExtension) =>
						`${fileExtension ? `${fileName}.${fileExtension}` : fileName}`.replace(
							/scramjet/g,
							"main"
						),
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet-controller/dist/*",
					dest: "static/chunks",
					rename: (fileName, fileExtension) =>
						`${fileExtension ? `${fileName}.${fileExtension}` : fileName}`.replace(
							/controller/g,
							"runtime"
						),
				},
			],
			watch: {
				reloadPageOnChange: true,
			},
		}),
	],
};
