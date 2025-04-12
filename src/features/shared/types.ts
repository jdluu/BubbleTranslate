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

// Minimal structure for error responses from Google APIs
export interface GoogleApiError {
	error?: {
		code?: number;
		message?: string;
		status?: string;
	};
}

// Structure assuming the data part of successful Translate API response
export interface TranslateApiData {
	data?: {
		translations?: {
			translatedText: string;
			detectedSourceLanguage?: string; // Optional
		}[];
	};
}

// --- Messaging Actions ---
// Using string literal types for actions provides better type safety
export type MessageAction =
	| "startTranslation"
	| "processImage"
	| "triggerPageAnalysis"
	| "displayBlockTranslation"
	| "translationError";

// --- Message Payloads ---
// Base structure for all messages for potential discrimination
export interface BaseMessage {
	action: MessageAction;
}

export interface StartTranslationMessage extends BaseMessage {
	action: "startTranslation";
	// No additional payload needed for this action
}

export interface ProcessImageMessage extends BaseMessage {
	action: "processImage";
	imageUrl: string;
	imageId: string; // The unique ID assigned by content script
}

export interface TriggerAnalysisMessage extends BaseMessage {
	action: "triggerPageAnalysis";
	// No additional payload needed for this action
}

export interface DisplayTranslationMessage extends BaseMessage {
	action: "displayBlockTranslation";
	imageId: string;
	translatedText: string;
	boundingBox: BoundingBox;
}

export interface TranslationErrorMessage extends BaseMessage {
	action: "translationError";
	imageId: string;
	error: string;
	boundingBox: BoundingBox | null; // Bounding box might not exist for image-level errors
}

// Union type for messages received by the background script
export type BackgroundMessage = StartTranslationMessage | ProcessImageMessage;

// Union type for messages received by the content script
export type ContentScriptMessage =
	| TriggerAnalysisMessage
	| DisplayTranslationMessage
	| TranslationErrorMessage;

// --- Response Payloads ---
export interface BackgroundResponse {
	status: "received" | "error" | "processingImages" | "unknown";
	message?: string; // Optional message, e.g., for errors
	foundCount?: number;
	sentCount?: number;
	// Add other relevant response data if needed
}

export interface AnalysisResponseMessage {
	status: "processingImages" | "error";
	foundCount: number;
	sentCount?: number; // Optional if status is error
	error?: string; // Optional error message
}

// --- Overlay Positioning ---
export interface OverlayPosition {
	top: number;
	left: number;
	width: number;
	height: number;
}
