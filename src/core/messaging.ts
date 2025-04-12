// src/core/messaging.ts
import type {
	BoundingBox,
	MessageAction,
	TranslationErrorMessage,
} from "@shared/types";

/**
 * Safely sends a message to a specific tab, catching potential errors
 * (e.g., if the tab was closed or the content script isn't ready).
 * @param tabId - The target tab ID.
 * @param message - The message object to send. Must include an 'action' property.
 */
export function safeSendMessage(
	tabId: number,
	message: { action: MessageAction; [key: string]: any }
): void {
	chrome.tabs.sendMessage(tabId, message).catch((error: Error) => {
		// Common errors: "Could not establish connection..." or "No receiving end..."
		console.warn(
			`BubbleTranslate BG: Failed to send message to tab ${tabId} (Action: ${message.action}). Error: ${error.message}`
		);
		// Decide if further action is needed, e.g., retry or log persistence
	});
}

/**
 * Sends an error message back to the content script associated with a specific image.
 * @param tabId - The target tab ID.
 * @param imageId - The unique ID of the image associated with the error.
 * @param errorMessage - The error message text.
 * @param boundingBox - Optional bounding box for block-specific errors.
 */
export function sendProcessingError(
	tabId: number,
	imageId: string,
	errorMessage: string,
	boundingBox: BoundingBox | null = null
): void {
	const message: TranslationErrorMessage = {
		action: "translationError",
		imageId: imageId,
		error: errorMessage,
		boundingBox: boundingBox,
	};
	safeSendMessage(tabId, message);
}

/**
 * Sends a request to the background script. Returns a promise that resolves with the response.
 * @param message - The message object to send. Must include an 'action' property.
 * @returns Promise<T> Resolves with the response from the background script.
 * @template T The expected type of the response payload.
 */
export function sendMessageToBackground<T>(message: {
	action: MessageAction;
	[key: string]: any;
}): Promise<T> {
	return chrome.runtime.sendMessage(message);
}
