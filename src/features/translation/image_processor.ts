// src/features/translation/image_processor.ts

/**
 * Converts a Blob object to a Base64 encoded data URL string.
 * @param blob - The Blob to convert.
 * @returns A promise resolving with the data URL string.
 * @throws {Error} If the FileReader encounters an error.
 */
export function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = (event: ProgressEvent<FileReader>) => {
			// Provide more context on reader error
			const error = (event.target as FileReader | null)?.error;
			reject(
				new Error(`FileReader error: ${error?.message || "Unknown error"}`)
			);
		};
		reader.onload = () => {
			// result is the Data URL string
			if (typeof reader.result === "string") {
				resolve(reader.result);
			} else {
				// Should not happen with readAsDataURL, but good practice to check
				reject(new Error("FileReader did not return a string result."));
			}
		};
		reader.readAsDataURL(blob);
	});
}

/**
 * Fetches image data from a URL and returns its Base64 representation (without prefix).
 * @param imageUrl - The URL of the image to fetch.
 * @param imageId - The unique ID of the image (for logging).
 * @returns A promise resolving with the clean Base64 string.
 * @throws {Error} If fetching or processing fails.
 */
export async function fetchAndProcessImage(
	imageUrl: string,
	imageId: string
): Promise<string> {
	console.log(`   [${imageId}] Fetching image data...`);
	const response = await fetch(imageUrl);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch image: ${response.status} ${response.statusText}`
		);
	}
	const imageBlob = await response.blob();
	const base64ImageData = await blobToBase64(imageBlob);
	const cleanBase64 = base64ImageData.split(",")[1]; // Remove data URL prefix

	console.log(
		`   [${imageId}] Image data fetched (Base64 length: ${
			cleanBase64?.length || 0
		})`
	);

	if (!cleanBase64) {
		throw new Error("Failed to extract Base64 data from image.");
	}
	return cleanBase64;
}
