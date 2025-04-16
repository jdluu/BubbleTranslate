// src/features/translation/api_client.ts
import { VISION_API_URL, TRANSLATE_API_URL } from "@shared/constants";
import type {
	BoundingBox,
	GoogleApiError,
	TranslateApiData,
	VisionApiParseResult,
	VisionTextBlock,
	ApiName, // Import ApiName
} from "@shared/types";
import { ApiClientError } from "@shared/types"; // Import the custom error

// Helper to create consistent ApiClientError instances
function createApiClientError(
	apiName: ApiName,
	messagePrefix: string,
	httpStatus: number,
	responseData?: any, // Parsed JSON data, if available
	cause?: Error // Original fetch/network error
): ApiClientError {
	let errorMessage = `${messagePrefix}`;
	let apiStatus: string | undefined;
	let apiCode: number | undefined;
	let details: any[] | undefined;

	const googleError = (responseData as GoogleApiError)?.error;

	if (googleError) {
		errorMessage = `${messagePrefix}: ${
			googleError.message || "Unknown API error"
		}`;
		apiStatus = googleError.status;
		apiCode = googleError.code;
		details = googleError.details;
	} else if (cause) {
		// Handle network errors or JSON parsing errors
		errorMessage = `${messagePrefix}: ${cause.message}`;
	} else if (httpStatus) {
		errorMessage = `${messagePrefix}: HTTP ${httpStatus}`;
	}

	// Special handling for timeouts
	if (cause?.name === "TimeoutError") {
		errorMessage = `${messagePrefix}: Request timed out.`;
		httpStatus = 0; // Indicate non-HTTP failure
		apiStatus = "TIMEOUT";
	}

	return new ApiClientError(errorMessage, {
		apiName,
		httpStatus,
		apiStatus,
		apiCode,
		details,
		cause,
	});
}

/**
 * Calls Google Vision API (DOCUMENT_TEXT_DETECTION) to detect text blocks.
 * @param base64ImageData - Base64 encoded image data (without prefix).
 * @param apiKey - The Google Cloud API Key.
 * @returns A promise resolving to an object containing an array of detected blocks.
 * @throws {ApiClientError} If the API call fails, returns an error, or times out.
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
			},
		],
	};

	let response: Response;
	let data: any; // Use 'any' for flexible parsing before validation

	console.log(`   Calling Vision API...`);
	try {
		response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(15000), // 15 second timeout
		});

		// Attempt to parse JSON regardless of status, as error details might be in the body
		try {
			data = await response.json();
		} catch (jsonError: any) {
			// Handle cases where response is not JSON (e.g., HTML error page, network issues)
			if (!response.ok) {
				// Throw error based on HTTP status if JSON parsing failed
				throw createApiClientError(
					"Vision",
					`Vision API HTTP Error`,
					response.status,
					null, // No JSON data available
					new Error(response.statusText || "Failed to parse response") // Include status text if possible
				);
			} else {
				// This case is less likely for a 2xx response but handle defensively
				console.warn("Vision API: Non-JSON response with OK status:", response);
				throw createApiClientError(
					"Vision",
					"Vision API received non-JSON success response",
					response.status,
					null,
					jsonError
				);
			}
		}

		// Check HTTP status *after* parsing JSON
		if (!response.ok) {
			throw createApiClientError(
				"Vision",
				`Vision API HTTP Error`,
				response.status,
				data // Pass parsed data containing potential error details
			);
		}

		// --- Process successful response ---

		if (!data.responses || data.responses.length === 0) {
			console.warn("   Vision API returned empty responses array.");
			return { blocks: [] }; // No data, but not an API error
		}

		const visionResponse = data.responses[0];

		// Check for errors within the Vision API response structure
		if (visionResponse.error) {
			// Treat this as a specific API error, even if HTTP status was 200
			console.error("Vision API Error within response:", visionResponse.error);
			throw createApiClientError(
				"Vision",
				`Vision API Error`,
				response.status, // Use the original HTTP status
				{ error: visionResponse.error } // Structure it like a GoogleApiError
			);
		}

		// --- Extract data (existing logic) ---
		const annotation = visionResponse.fullTextAnnotation;
		const extractedBlocks: VisionTextBlock[] = [];

		if (annotation?.pages?.[0]?.blocks) {
			annotation.pages[0].blocks.forEach((block: any) => {
				let blockText = "";
				const boundingBox: BoundingBox | null = block.boundingBox || null;

				block.paragraphs?.forEach((para: any) => {
					para.words?.forEach((word: any) => {
						const wordText =
							word.symbols?.map((s: any) => s.text).join("") || "";
						blockText += wordText;
						const breakType = word.property?.detectedBreak?.type;
						if (
							breakType === "SPACE" ||
							breakType === "SURE_SPACE" ||
							breakType === "EOL_SURE_SPACE" ||
							breakType === "LINE_BREAK" // Treat line breaks as spaces for consolidation
						) {
							blockText += " ";
						}
					});
				});

				blockText = blockText.trim().replace(/\s+/g, " "); // Normalize whitespace

				if (blockText && boundingBox && isValidBoundingBox(boundingBox)) {
					extractedBlocks.push({ text: blockText, boundingBox: boundingBox });
				} else if (blockText) {
					// Only warn if text exists but box is bad
					console.warn(
						"   Vision API returned block with invalid boundingBox structure:",
						boundingBox
					);
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
	} catch (error: any) {
		// Catch fetch errors (network, CORS, DNS, timeout) or re-throw our custom errors
		if (error instanceof ApiClientError) {
			// If it's already our custom error, just re-throw it
			throw error;
		} else {
			// Assume other errors are network/fetch related or timeout
			console.error("Vision API fetch/processing error:", error);
			throw createApiClientError(
				"Vision",
				"Vision API request failed",
				0, // Indicate non-HTTP error
				null,
				error // Pass the original error as cause
			);
		}
	}
}

/**
 * Basic type guard to check if an object looks like our BoundingBox interface.
 */
function isValidBoundingBox(box: any): box is BoundingBox {
	// Refined check for vertices array with at least 4 points having x and y numbers
	return (
		box &&
		Array.isArray(box.vertices) &&
		box.vertices.length >= 4 && // Ensure at least 4 vertices
		box.vertices.every(
			(v: any) =>
				typeof v === "object" &&
				v !== null &&
				typeof v.x === "number" &&
				typeof v.y === "number"
		)
	);
}

/**
 * Calls Google Translate API to translate text.
 * @param text - Text to translate.
 * @param targetLang - Target language code (e.g., 'en').
 * @param apiKey - The Google Cloud API Key.
 * @returns A promise resolving to the translated text or null if translation fails/is empty.
 * @throws {ApiClientError} If the API call fails, returns an error, or times out.
 */
export async function callTranslateApi(
	text: string,
	targetLang: string,
	apiKey: string
): Promise<string | null> {
	if (!text || !text.trim()) {
		console.warn("      Skipping translation for empty text.");
		return null; // Not an error, just no work to do
	}

	const url = `${TRANSLATE_API_URL}?key=${apiKey}`;
	const body = {
		q: text,
		target: targetLang,
		format: "text",
	};

	let response: Response;
	let data: any;

	console.log(
		`      Calling Translate API for text: "${text.substring(0, 30)}..."`
	);
	try {
		response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(10000), // 10 second timeout
		});

		// Attempt to parse JSON
		try {
			data = await response.json();
		} catch (jsonError: any) {
			if (!response.ok) {
				throw createApiClientError(
					"Translate",
					`Translate API HTTP Error`,
					response.status,
					null,
					new Error(response.statusText || "Failed to parse response")
				);
			} else {
				console.warn(
					"Translate API: Non-JSON response with OK status:",
					response
				);
				throw createApiClientError(
					"Translate",
					"Translate API received non-JSON success response",
					response.status,
					null,
					jsonError
				);
			}
		}

		// Check HTTP status
		if (!response.ok) {
			throw createApiClientError(
				"Translate",
				`Translate API HTTP Error`,
				response.status,
				data // Pass potential error details from JSON
			);
		}

		// --- Process successful response ---

		// Check for explicit error structure within the Translate API response body
		// Note: Translate V2 API might put errors directly at the top level on failure,
		// handled by the !response.ok check. Success responses shouldn't have a top-level 'error'.
		// However, we keep this check for robustness or potential V3 differences.
		if ((data as GoogleApiError).error) {
			console.error("Translate API Error within response:", data.error);
			throw createApiClientError(
				"Translate",
				`Translate API Error`,
				response.status,
				data // Pass the full error data
			);
		}

		// Check for expected data structure for successful translation
		const translationData = (data as TranslateApiData)?.data?.translations?.[0]
			?.translatedText;

		if (typeof translationData === "string") {
			// Basic HTML entity decoding - consider a more robust library if complex entities are common
			return translationData
				.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec)) // Decode numeric entities
				.replace(/"/g, '"')
				.replace(/'/g, "'")
				.replace(/</g, "<")
				.replace(/>/g, ">")
				.replace(/&/g, "&"); // Decode named entities (amp must be last)
		} else {
			console.warn(
				"      Translate API response structure unexpected or missing translation:",
				JSON.stringify(data) // Log the structure for debugging
			);
			// Treat missing translation data as an unexpected API behavior, not a full error
			// Return null, but the warning indicates a potential issue.
			return null;
		}
	} catch (error: any) {
		if (error instanceof ApiClientError) {
			throw error;
		} else {
			console.error("Translate API fetch/processing error:", error);
			throw createApiClientError(
				"Translate",
				"Translate API request failed",
				0, // Indicate non-HTTP error
				null,
				error
			);
		}
	}
}
