// src/features/translation/api_client.ts
import { VISION_API_URL, TRANSLATE_API_URL } from "@shared/constants";
import type {
	BoundingBox,
	GoogleApiError,
	TranslateApiData,
	VisionApiParseResult,
	VisionTextBlock,
} from "@shared/types";

/**
 * Calls Google Vision API (DOCUMENT_TEXT_DETECTION) to detect text blocks.
 * @param base64ImageData - Base64 encoded image data (without prefix).
 * @param apiKey - The Google Cloud API Key.
 * @returns A promise resolving to an object containing an array of detected blocks.
 * @throws {Error} If the API call fails or returns a significant error.
 */
export async function callVisionApiDetectBlocks(
	base64ImageData: string,
	apiKey: string
): Promise<VisionApiParseResult> {
	const url = `${VISION_API_URL}?key=${apiKey}`;
	const body = {
		requests: [
			{
				image: { content: base64ImageData },
				features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
				// Consider adding language hints if source language is often known, e.g., ["ja", "en"]
				// imageContext: { languageHints: ["ja"] }
			},
		],
	};

	console.log(`   Calling Vision API...`);
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(15000),
	});

	// We expect a JSON response, potentially including error details
	const data: any | GoogleApiError = await response.json(); // Use 'any' for initial parsing, then check structure

	if (!response.ok) {
		const errorDetail =
			(data as GoogleApiError)?.error?.message || response.statusText;
		throw new Error(`Vision API HTTP Error ${response.status}: ${errorDetail}`);
	}
	if (!data.responses || data.responses.length === 0) {
		console.warn("   Vision API returned empty responses array.");
		return { blocks: [] }; // No data, but not necessarily an API error
	}

	const visionResponse = data.responses[0];
	if (visionResponse.error) {
		throw new Error(`Vision API Error: ${visionResponse.error.message}`);
	}

	// Extract structured block data from fullTextAnnotation
	const annotation = visionResponse.fullTextAnnotation;
	const extractedBlocks: VisionTextBlock[] = [];

	if (annotation?.pages?.[0]?.blocks) {
		annotation.pages[0].blocks.forEach((block: any) => {
			// Use 'any' for raw block from API
			let blockText = "";
			// Type assertion is okay here if we trust the API structure or add validation
			const boundingBox: BoundingBox | null = block.boundingBox || null;

			block.paragraphs?.forEach((para: any) => {
				para.words?.forEach((word: any) => {
					const wordText = word.symbols?.map((s: any) => s.text).join("") || "";
					blockText += wordText;
					const breakType = word.property?.detectedBreak?.type;
					if (
						breakType === "SPACE" ||
						breakType === "SURE_SPACE" ||
						breakType === "EOL_SURE_SPACE"
					) {
						blockText += " ";
					} else if (breakType === "LINE_BREAK") {
						blockText += " "; // Prefer space over newline
					}
				});
			});

			blockText = blockText.trim();
			if (blockText && boundingBox) {
				// Ensure the boundingBox conforms to our type before pushing
				if (isValidBoundingBox(boundingBox)) {
					extractedBlocks.push({ text: blockText, boundingBox: boundingBox });
				} else {
					console.warn(
						"   Vision API returned block with invalid boundingBox structure:",
						boundingBox
					);
				}
			}
		});
		console.log(
			`   Vision API Parsed ${extractedBlocks.length} blocks with text and boundingBox.`
		);
	} else {
		console.log(
			`   Vision API: No 'fullTextAnnotation' found or no blocks within.`
		);
	}

	return { blocks: extractedBlocks };
}

/**
 * Basic type guard to check if an object looks like our BoundingBox interface.
 */
function isValidBoundingBox(box: any): box is BoundingBox {
	return (
		box &&
		Array.isArray(box.vertices) &&
		box.vertices.length >= 4 &&
		box.vertices.every(
			(v: any) => typeof v?.x === "number" && typeof v?.y === "number"
		)
	);
}

/**
 * Calls Google Translate API to translate text.
 * @param text - Text to translate.
 * @param targetLang - Target language code (e.g., 'en').
 * @param apiKey - The Google Cloud API Key.
 * @returns A promise resolving to the translated text or null if translation fails/is empty.
 * @throws {Error} If the API call fails or returns a significant error.
 */
export async function callTranslateApi(
	text: string,
	targetLang: string,
	apiKey: string
): Promise<string | null> {
	if (!text || !text.trim()) {
		console.warn("      Skipping translation for empty text.");
		return null;
	}

	const url = `${TRANSLATE_API_URL}?key=${apiKey}`;
	const body = {
		q: text,
		target: targetLang,
		format: "text",
	};

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10000), // Optional: 10 seconds timeout
	});

	// Expecting JSON response, could be TranslateApiData or GoogleApiError
	const data: TranslateApiData | GoogleApiError = await response.json();

	if (!response.ok) {
		const errorDetail =
			(data as GoogleApiError)?.error?.message || response.statusText;
		throw new Error(
			`Translate API HTTP Error ${response.status}: ${errorDetail}`
		);
	}
	// Check for error structure within the successful response body
	if ((data as GoogleApiError).error) {
		throw new Error(
			`Translate API Error: ${(data as GoogleApiError).error!.message}`
		);
	}

	// Check for expected data structure
	const translationData = (data as TranslateApiData)?.data?.translations?.[0]
		?.translatedText;

	if (translationData) {
		// Basic HTML entity decoding - consider a more robust solution if needed
		return translationData
			.replace(/"/g, '"')
			.replace(/'/g, "'")
			.replace(/&/g, "&")
			.replace(/</g, "<")
			.replace(/>/g, ">");
	} else {
		console.warn(
			"      Translate API response structure unexpected or missing translation:",
			data
		);
		return null;
	}
}
