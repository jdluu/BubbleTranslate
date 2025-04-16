// src/features/translation/translation_service.ts
import { safeSendMessage } from "@core/messaging"; // We'll need a refined error sending mechanism
import { DEFAULT_TARGET_LANG } from "@shared/constants";
import type {
	BoundingBox,
	DisplayTranslationMessage,
	ExtensionSettings,
	VisionTextBlock,
	ImageProcessingErrorMessage, // Import the specific error message type
	SerializedApiClientError, // Import the serialized error type
} from "@shared/types";
import {
	ApiClientError, // Import the custom error class
	isApiClientError, // Type guard might be useful, though instanceof works
	isSerializedApiClientError, // Import type guard for serialized errors (used in messaging helper potentially)
} from "@shared/types"; // Assuming ApiClientError is exported from types.ts
import {
	callTranslateApi,
	callVisionApiDetectBlocks,
} from "@features/translation/api_client";
import { fetchAndProcessImage } from "@features/translation/image_processor";

/**
 * Sends a structured error message back to the content script for a specific image.
 * @param tabId - The ID of the tab where the error occurred.
 * @param imageId - The unique identifier of the image related to the error.
 * @param error - The error object (preferably ApiClientError) or a generic error.
 * @param boundingBox - Optional bounding box if the error relates to a specific text block.
 */
function sendStructuredError(
	tabId: number,
	imageId: string,
	error: unknown, // Catch unknown errors
	boundingBox: BoundingBox | null = null
): void {
	let serializedError: SerializedApiClientError | { message: string };

	if (error instanceof ApiClientError) {
		// If it's our specific error type, serialize it
		serializedError = error.serialize();
		console.error(
			`BubbleTranslate Service: API Client Error for image [${imageId}] (${serializedError.apiName} - HTTP ${serializedError.httpStatus}): ${serializedError.message}`
		);
	} else if (error instanceof Error) {
		// For generic errors, create a simple message object
		serializedError = { message: error.message };
		console.error(
			`BubbleTranslate Service: Generic Error for image [${imageId}]:`,
			error
		);
	} else {
		// Fallback for non-Error types thrown
		serializedError = {
			message: "An unknown error occurred during processing.",
		};
		console.error(
			`BubbleTranslate Service: Unknown Thrown Value for image [${imageId}]:`,
			error
		);
	}

	const message: ImageProcessingErrorMessage = {
		action: "imageProcessingError",
		imageId: imageId,
		error: serializedError,
		boundingBox: boundingBox, // Null if it's an image-level error
	};
	safeSendMessage(tabId, message);
}

/**
 * Orchestrates the processing for a single image:
 * Fetches settings, image data, calls OCR/Translate APIs for text blocks,
 * and sends results or structured errors back to the content script.
 * @param imageUrl - The URL of the image to process.
 * @param imageId - The unique identifier assigned to this image by the content script.
 * @param tabId - The ID of the tab where the image is located.
 */
export async function processImageAndTranslateBlocks(
	imageUrl: string,
	imageId: string,
	tabId: number
): Promise<void> {
	console.log(
		`BubbleTranslate Service: Starting processing for image [${imageId}] URL: ${imageUrl.substring(
			0,
			100
		)}...`
	);

	try {
		// 1. Get API Key and Target Language from storage
		const settings = (await chrome.storage.local.get([
			"apiKey",
			"targetLang",
		])) as Partial<ExtensionSettings>;

		const apiKey = settings.apiKey;
		const targetLang = settings.targetLang || DEFAULT_TARGET_LANG;

		// Handle missing API Key explicitly *before* making calls
		if (!apiKey) {
			console.error(`   [${imageId}] API Key is missing.`);
			// Create a specific error message for this common configuration issue
			sendStructuredError(
				tabId,
				imageId,
				new Error(
					"API Key not configured. Please set it in the extension options."
				)
			);
			return; // Stop processing this image
		}
		console.log(`   [${imageId}] Using Target Language: ${targetLang}`);

		// 2. Fetch image data and convert to Base64 (can throw errors)
		const cleanBase64 = await fetchAndProcessImage(imageUrl, imageId);

		// 3. Call OCR to detect text blocks (can throw ApiClientError)
		const visionResult = await callVisionApiDetectBlocks(cleanBase64, apiKey);

		if (!visionResult?.blocks || visionResult.blocks.length === 0) {
			console.log(`   [${imageId}] No text blocks found by OCR.`);
			// Optional: Send a message indicating no text was found? Or just silently finish.
			// For now, we just finish silently as it's not an error state.
			return;
		}

		console.log(
			`   [${imageId}] Vision API found ${visionResult.blocks.length} text blocks.`
		);

		// 4. Process each block: Translate and send result back
		// Use Promise.allSettled to ensure all blocks are processed even if some fail
		const blockProcessingPromises = visionResult.blocks.map(
			(block: VisionTextBlock, index: number) =>
				processSingleBlock(block, index, imageId, tabId, targetLang, apiKey)
		);

		const results = await Promise.allSettled(blockProcessingPromises);

		// Optional: Log summary of block processing results
		const successfulBlocks = results.filter(
			(r) => r.status === "fulfilled"
		).length;
		const failedBlocks = results.length - successfulBlocks;
		console.log(
			`   [${imageId}] Finished processing all blocks. Success: ${successfulBlocks}, Failed: ${failedBlocks}.`
		);
	} catch (error: unknown) {
		// Catch errors from initial setup (settings, fetch, OCR) or unexpected issues
		// These errors apply to the image as a whole.
		sendStructuredError(tabId, imageId, error, null); // Pass null for bounding box
	}
}

/**
 * Processes a single detected text block: cleans text, translates, sends message or structured error.
 * @param block - The detected text block from Vision API.
 * @param index - The index of the block (for logging).
 * @param imageId - The unique ID of the parent image.
 * @param tabId - The ID of the target tab.
 * @param targetLang - The target language for translation.
 * @param apiKey - The API key.
 */
async function processSingleBlock(
	block: VisionTextBlock,
	index: number,
	imageId: string,
	tabId: number,
	targetLang: string,
	apiKey: string
): Promise<void> {
	// Validate block structure early
	if (!block.text || !block.boundingBox) {
		console.warn(
			`   [${imageId}] Skipping block ${index}: Missing text or boundingBox.`
		);
		// Decide if this should be reported as an error - potentially an OCR issue?
		// For now, skipping silently. Could send an error if this indicates a problem.
		// sendStructuredError(tabId, imageId, new Error(`Block ${index} has invalid structure`), block.boundingBox);
		return;
	}

	// Clean and validate text content
	const blockTextClean = block.text.replace(/\s+/g, " ").trim();
	if (!blockTextClean) {
		// console.warn(
		//     `   [${imageId}] Skipping block ${index}: Empty text after cleanup.`
		// );
		// Skip silently - empty blocks are common and not errors.
		return;
	}

	try {
		// console.log( // Reduce log verbosity slightly
		//     `      [${imageId}] Translating block ${index}: "${blockTextClean.substring(0, 40)}..."`
		// );

		// Call translation API (can throw ApiClientError)
		const translatedText = await callTranslateApi(
			blockTextClean,
			targetLang,
			apiKey
		);

		// Handle successful translation (including empty string result from API)
		if (translatedText !== null) {
			// Check for null explicitly, as empty string "" is a valid translation
			// console.log( // Reduce log verbosity slightly
			//     `      [${imageId}] Sending translation for block ${index} to tab ${tabId}`
			// );
			const message: DisplayTranslationMessage = {
				action: "displayBlockTranslation",
				imageId: imageId,
				boundingBox: block.boundingBox,
				originalText: blockTextClean, // Send the cleaned original text
				translatedText: translatedText,
				// detectedSourceLang: detectedLang, // Add if API starts returning it
			};
			safeSendMessage(tabId, message);
		} else {
			// This case means the API call itself succeeded (HTTP 200) but returned no translation data.
			// Treat this as a translation failure specific to this block.
			console.warn(
				`      [${imageId}] Translation API returned null result for block ${index}. Text: "${blockTextClean}"`
			);
			throw new Error(
				"Translation API returned null or unexpected empty result."
			); // Throw to be caught below
		}
	} catch (blockError: unknown) {
		// Catch errors specific to this block (e.g., Translate API call failure, null result)
		// Send a structured error including the bounding box for this specific block
		sendStructuredError(tabId, imageId, blockError, block.boundingBox);
		// Re-throwing is not necessary here as Promise.allSettled handles it.
	}
}
