// src/shared/types.ts

// --- Settings ---
export interface ExtensionSettings {
	apiKey?: string; // Optional because it might not be set initially
	targetLang: string;
	fontSize: string;
	textColor: string; // Should store hex color string
	bgColor: string; // Should store rgba color string
	zIndex?: string; // Optional, might add later
}

export interface OverlayStyleSettings {
	fontSize: string;
	textColor: string;
	backgroundColor: string;
	zIndex: string;
}

// --- Vision API Related ---
export interface Vertex {
	x: number;
	y: number;
}

export interface BoundingBox {
	vertices: Vertex[];
	// Add normalizedVertices if you plan to use them
}

export interface VisionTextBlock {
	text: string;
	boundingBox: BoundingBox;
	// Include confidence or other properties if needed
}

export interface VisionApiParseResult {
	blocks: VisionTextBlock[];
}

// --- Translate API Related ---
// Structure assuming the data part of successful Translate API response (v2)
export interface TranslateApiData {
	data?: {
		translations?: {
			translatedText: string;
			detectedSourceLanguage?: string; // Optional
		}[];
	};
}

// --- Google API Error Handling ---

/**
 * Represents the typical structure of an error object returned by Google Cloud APIs in JSON format.
 */
export interface GoogleApiErrorResponse {
	error: {
		code: number; // HTTP status code (e.g., 400, 403, 429)
		message: string; // Developer-facing error message
		status: string; // Google-specific status code (e.g., "INVALID_ARGUMENT", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED")
		details?: any[]; // Optional array containing more specific error details
	};
}

/**
 * Type guard to check if an object conforms to the GoogleApiErrorResponse structure.
 */
export function isGoogleApiErrorResponse(
	obj: any
): obj is GoogleApiErrorResponse {
	return (
		typeof obj === "object" &&
		obj !== null &&
		typeof obj.error === "object" &&
		obj.error !== null &&
		typeof obj.error.code === "number" &&
		typeof obj.error.message === "string" &&
		typeof obj.error.status === "string"
	);
}

/**
 * Identifies the specific API that produced an error.
 */
export type ApiName = "Vision" | "Translate";

/**
 * Custom error class for handling errors originating from API client interactions.
 * It encapsulates details about the HTTP status, API-specific status codes,
 * and categorizes common error types (Network, Auth, Quota).
 */
export class ApiClientError extends Error {
	readonly apiName: ApiName;
	readonly httpStatus: number; // HTTP status code (0 for network/fetch/timeout errors)
	readonly apiStatus?: string; // Google's specific status string (e.g., "PERMISSION_DENIED")
	readonly apiCode?: number; // Google's specific error code
	readonly details?: any[]; // Original 'details' array from GoogleApiErrorResponse
	readonly isAuthError: boolean;
	readonly isQuotaError: boolean;
	readonly isNetworkError: boolean;
	readonly isTimeoutError: boolean;

	constructor(
		message: string,
		options: {
			apiName: ApiName;
			httpStatus: number; // Use 0 for non-HTTP errors like network or timeout
			apiStatus?: string; // Google's specific status string
			apiCode?: number; // Google's specific code
			details?: any[]; // Google's details array
			cause?: Error; // Original error (e.g., from fetch, AbortSignal)
		}
	) {
		// Pass the original error as 'cause' for better stack traces and debugging
		super(message, { cause: options.cause });
		this.name = "ApiClientError"; // Set the error name
		this.apiName = options.apiName;
		this.httpStatus = options.httpStatus;
		this.apiStatus = options.apiStatus;
		this.apiCode = options.apiCode;
		this.details = options.details;

		// Determine specific error types based on status codes and messages
		this.isNetworkError =
			options.httpStatus === 0 && options.cause?.name !== "TimeoutError";
		this.isTimeoutError = options.cause?.name === "TimeoutError";
		this.isAuthError =
			options.httpStatus === 401 || // Unauthorized
			options.httpStatus === 403 || // Forbidden
			options.apiStatus === "PERMISSION_DENIED" ||
			options.apiStatus === "UNAUTHENTICATED";
		this.isQuotaError =
			options.httpStatus === 429 || // Too Many Requests
			options.apiStatus === "RESOURCE_EXHAUSTED" ||
			message.toLowerCase().includes("quota"); // Fallback check on message text

		// Ensure stack trace is captured correctly (especially in V8 environments)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ApiClientError);
		}
	}

	/**
	 * Provides a user-friendly summary of the error.
	 */
	toUserFriendlyMessage(): string {
		if (this.isTimeoutError) {
			return `${this.apiName} API request timed out. Please try again.`;
		}
		if (this.isNetworkError) {
			return `Network error connecting to ${this.apiName} API. Check your internet connection.`;
		}
		if (this.isAuthError) {
			return `Authentication error with ${this.apiName} API. Please check your API Key in the settings.`;
		}
		if (this.isQuotaError) {
			return `${this.apiName} API quota likely exceeded. Check your Google Cloud usage or wait and try again.`;
		}
		if (this.httpStatus >= 500) {
			return `${this.apiName} API unavailable (Server Error ${this.httpStatus}). Please try again later.`;
		}
		if (this.httpStatus >= 400) {
			// More specific client error if possible
			return `Error calling ${this.apiName} API (${
				this.apiStatus || `HTTP ${this.httpStatus}`
			}). ${this.message}`;
		}
		// Generic fallback
		return `An error occurred with the ${this.apiName} API: ${this.message}`;
	}

	/**
	 * Serializes the error object into a plain object suitable for sending via chrome.runtime.sendMessage.
	 * Error objects themselves often don't serialize correctly.
	 */
	serialize(): SerializedApiClientError {
		return {
			name: this.name,
			message: this.message,
			apiName: this.apiName,
			httpStatus: this.httpStatus,
			apiStatus: this.apiStatus,
			apiCode: this.apiCode,
			details: this.details, // Note: details might not always serialize well if complex
			isAuthError: this.isAuthError,
			isQuotaError: this.isQuotaError,
			isNetworkError: this.isNetworkError,
			isTimeoutError: this.isTimeoutError,
			// cause is intentionally omitted as it's often not serializable or useful across contexts
		};
	}
}

/**
 * A plain object representation of an ApiClientError for serialization.
 */
export interface SerializedApiClientError {
	name: "ApiClientError";
	message: string;
	apiName: ApiName;
	httpStatus: number;
	apiStatus?: string;
	apiCode?: number;
	details?: any[];
	isAuthError: boolean;
	isQuotaError: boolean;
	isNetworkError: boolean;
	isTimeoutError: boolean;
}

/**
 * Type guard to check if an object is a SerializedApiClientError.
 */
export function isSerializedApiClientError(
	obj: any
): obj is SerializedApiClientError {
	return (
		typeof obj === "object" &&
		obj !== null &&
		obj.name === "ApiClientError" &&
		typeof obj.message === "string"
	);
}

// --- Messaging Actions ---
// Using string literal types for actions provides better type safety
export type MessageAction =
	| "startTranslation"
	| "processImage"
	| "triggerPageAnalysis"
	| "displayBlockTranslation"
	| "translationError" // Generic error for now, maybe split later
	| "imageProcessingError"; // Specific error during image fetching/OCR stage

// --- Message Payloads ---
// Base structure for all messages for potential discrimination
export interface BaseMessage {
	action: MessageAction;
}

export interface StartTranslationMessage extends BaseMessage {
	action: "startTranslation";
	// No additional payload needed for this action
}

// Message sent from Content Script to Background to process a single image
export interface ProcessImageMessage extends BaseMessage {
	action: "processImage";
	imageUrl: string;
	imageId: string; // The unique ID assigned by content script
	imageElementId?: string; // Optional ID of the actual DOM element
}

// Message sent from Popup/Background to Content Script to initiate analysis
export interface TriggerAnalysisMessage extends BaseMessage {
	action: "triggerPageAnalysis";
	// No additional payload needed for this action
}

// Message sent from Background to Content Script to display a successful translation
export interface DisplayTranslationMessage extends BaseMessage {
	action: "displayBlockTranslation";
	imageId: string; // ID matching the ProcessImageMessage
	translatedText: string;
	originalText: string; // Send original OCR'd text too
	boundingBox: BoundingBox;
	detectedSourceLang?: string; // Optional: if detected
}

// Message sent from Background to Content Script for errors *specific to one image's processing*
// This includes API errors (Vision, Translate) or image fetching errors related to this image.
export interface ImageProcessingErrorMessage extends BaseMessage {
	action: "imageProcessingError";
	imageId: string; // ID matching the ProcessImageMessage
	error: SerializedApiClientError | { message: string }; // Send structured error or fallback message
	boundingBox: BoundingBox | null; // Bounding box may exist from OCR stage even if translation failed
}

// Union type for messages received by the background script
export type BackgroundMessage = ProcessImageMessage; // StartTranslation might be handled differently (e.g., from popup click to background directly)

// Union type for messages received by the content script from the background
export type ContentScriptMessage =
	| TriggerAnalysisMessage
	| DisplayTranslationMessage
	| ImageProcessingErrorMessage;

// --- Response Payloads ---
// Used for immediate responses to messages, e.g., from background to popup
export interface BackgroundResponse {
	status: "received" | "error" | "processing" | "apiKeyMissing" | "unknown";
	message?: string; // Optional message, e.g., for errors or status
}

// Used for the response *from* the content script *to* the background/popup after analysis is triggered
export interface AnalysisResponseMessage {
	status: "processingImages" | "noImagesFound" | "error";
	imageCount?: number; // Number of images found and sent for processing
	error?: string; // Optional error message if analysis failed
}

// --- Overlay Positioning ---
export interface OverlayPosition {
	top: number;
	left: number;
	width: number;
	height: number;
}
