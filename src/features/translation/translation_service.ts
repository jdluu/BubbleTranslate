// src/features/translation/translation_service.ts
import { safeSendMessage, sendProcessingError } from "@core/messaging";
import { DEFAULT_TARGET_LANG } from "@shared/constants";
import type {
	BoundingBox,
	DisplayTranslationMessage,
	ExtensionSettings,
	VisionTextBlock,
} from "@shared/types";
import {
	callTranslateApi,
	callVisionApiDetectBlocks,
} from "@features/translation/api_client";
import { fetchAndProcessImage } from "@features/translation/image_processor";

/**
 * Orchestrates the processing for a single image:
 * Fetches settings, image data, calls OCR/Translate APIs for text blocks,
 * and sends results (or errors) back to the content script.
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
		`BubbleTranslate Service: Starting processing for image [${imageId}]`
	);

	try {
		// 1. Get API Key and Target Language from storage
		// Type assertion needed as chrome.storage.local.get returns Promise<{[key: string]: any}>
		const settings = (await chrome.storage.local.get([
			"apiKey",
			"targetLang",
		])) as Partial<ExtensionSettings>;

		const apiKey = settings.apiKey;
		const targetLang = settings.targetLang || DEFAULT_TARGET_LANG;

		if (!apiKey) {
			throw new Error("API Key not configured in extension options.");
		}
		console.log(`   [${imageId}] Using Target Language: ${targetLang}`);

		// 2. Fetch image data and convert to Base64
		const cleanBase64 = await fetchAndProcessImage(imageUrl, imageId);

		// 3. Call OCR to detect text blocks
		const visionResult = await callVisionApiDetectBlocks(cleanBase64, apiKey);

		if (!visionResult?.blocks || visionResult.blocks.length === 0) {
			console.log(`   [${imageId}] No text blocks found by OCR.`);
			return; // Finished processing for this image if no text
		}

		console.log(
			`   [${imageId}] Vision API found ${visionResult.blocks.length} text blocks.`
		);

		// 4. Process each block: Translate and send result back
		const blockProcessingPromises = visionResult.blocks.map(
			(block: VisionTextBlock, index: number) =>
				processSingleBlock(block, index, imageId, tabId, targetLang, apiKey)
		);

		// Wait for all block translations to settle (complete or fail)
		await Promise.allSettled(blockProcessingPromises);
		console.log(`   [${imageId}] Finished processing all blocks.`);
	} catch (error: any) {
		// Catch errors from setup (settings, fetch, OCR)
		console.error(
			`BubbleTranslate Service: Critical error processing image [${imageId}]:`,
			error
		);
		sendProcessingError(
			tabId,
			imageId,
			error?.message || "Unknown processing error."
			// No bounding box here, as it's an image-level error
		);
	}
}

/**
 * Processes a single detected text block: cleans text, translates, sends message.
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
	if (!block.text || !block.boundingBox) {
		console.warn(
			`   [${imageId}] Skipping block ${index}: Missing text or boundingBox.`
		);
		return; // Skip block if essential data is missing
	}

	const blockTextClean = block.text.replace(/\s+/g, " ").trim();
	if (!blockTextClean) {
		console.warn(
			`   [${imageId}] Skipping block ${index}: Empty text after cleanup.`
		);
		return; // Skip empty blocks
	}

	try {
		console.log(
			`      [${imageId}] Translating block ${index}: "${blockTextClean.substring(
				0,
				40
			)}..."`
		);
		const translatedText = await callTranslateApi(
			blockTextClean,
			targetLang,
			apiKey
		);

		if (translatedText !== null) {
			// Check for null explicitly (empty string is valid)
			console.log(
				`      [${imageId}] Sending translation for block ${index} to tab ${tabId}`
			);
			const message: DisplayTranslationMessage = {
				action: "displayBlockTranslation",
				imageId: imageId,
				boundingBox: block.boundingBox,
				translatedText: translatedText,
			};
			safeSendMessage(tabId, message);
		} else {
			// Handle case where translation is null (API issue or empty result)
			throw new Error("Translation API returned null or empty result.");
		}
	} catch (blockError: any) {
		console.error(
			`      [${imageId}] Error processing block ${index}:`,
			blockError
		);
		sendProcessingError(
			tabId,
			imageId,
			`Block ${index}: ${blockError?.message || "Unknown translation error"}`,
			block.boundingBox // Send BB for context
		);
	}
}
