// webpack.config.js
import path from "path";
import { fileURLToPath } from "url";
import CopyPlugin from "copy-webpack-plugin";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin"; // Import the plugin

// Replicate __dirname functionality for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default (env, argv) => {
	const isProduction = argv.mode === "production";

	return {
		mode: isProduction ? "production" : "development",
		// Use 'inline-source-map' for better debugging in development
		// Use 'source-map' or false for production
		devtool: isProduction ? "source-map" : "inline-source-map",

		// Define entry points for your extension scripts
		entry: {
			// Adjust these paths based on your actual file structure
			background: "./src/core/background.ts",
			content: "./src/features/page_interaction/content.ts",
			popup: "./src/features/popup_ui/popup.ts",
			options: "./src/features/settings/options.ts",
			// Add other scripts if you have them (e.g., service workers, other content scripts)
		},

		output: {
			// Output directory
			path: path.resolve(__dirname, "dist"),
			// Naming convention for bundled files
			filename: "[name].bundle.js",
			// Clean the output directory before each build
			clean: true,
		},

		module: {
			rules: [
				{
					// Rule for TypeScript files
					test: /\.tsx?$/, // Match .ts and .tsx files
					use: "ts-loader", // Revert to simpler usage
					exclude: /node_modules/,
				},
				// Add rules for CSS or other assets if needed directly in JS/TS
				// {
				//  test: /\.css$/i,
				//  use: ['style-loader', 'css-loader'],
				// },
			],
		},

		resolve: {
			extensions: [".tsx", ".ts", ".js"],
			// Help webpack resolve modules relative to src and node_modules
			modules: [path.resolve(__dirname, "src"), "node_modules"],
			// Remove manual alias config, plugin handles it
			// alias: { ... },
			plugins: [
				// Add the plugin here
				new TsconfigPathsPlugin({
					configFile: "./tsconfig.json", // Point to your tsconfig file
				}),
			],
		},

		plugins: [
			new CopyPlugin({
				patterns: [
					// Keep manifest separate if it's directly in src
					{ from: "src/manifest.json", to: "manifest.json" },
					// Use context for globs within src
					{
						from: "**/*.html", // Find all html files within src
						context: "src/", // Set the base directory for this glob
						to: "[path][name][ext]", // Maintain original directory structure relative to src
					},
					{
						from: "**/*.css", // Find all css files within src
						context: "src/", // Set the base directory
						to: "[path][name][ext]", // Maintain structure
					},
					{
						from: "assets/icons/*.png", // Find icons within src/assets/icons
						context: "src/", // Set the base directory
						to: "assets/icons/[name][ext]", // Place them in dist/assets/icons
					},
					// Add other specific assets or adjust patterns as needed
				],
			}),
		],

		// Optional: Optimizations (Webpack handles basic minification in production)
		optimization: {
			minimize: isProduction,
			// Add more optimization options if needed
		},

		// Optional: Useful for development watching
		watchOptions: {
			ignored: /node_modules/,
		},
	};
};
