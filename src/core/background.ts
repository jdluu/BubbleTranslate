// src/core/background.ts
import { processImageAndTranslateBlocks } from "@features/translation/translation_service";
import type {
	BackgroundMessage,
	BackgroundResponse,
	MessageAction,
	ProcessImageMessage, // Message coming *from* content script
	TriggerAnalysisMessage, // Message going *to* content script
	AnalysisResponseMessage, // Response coming *from* content script
	ApiClientError, // Import the error class
	SerializedApiClientError, // Import the serialized error type
	isSerializedApiClientError, // Import type guard if needed later
} from "@shared/types";
import { isApiClientError } from "@shared/types"; // Can use instanceof, but good practice to import type guard too

// --- Constants ---
// Define actions using the type for better safety
const ACTION_START_TRANSLATION: MessageAction = "startTranslation"; // Typically triggered by Popup
const ACTION_PROCESS_IMAGE: MessageAction = "processImage"; // Sent by Content Script
const ACTION_TRIGGER_ANALYSIS: MessageAction = "triggerPageAnalysis"; // Sent *to* Content Script

const MAX_TAB_QUERY_ATTEMPTS = 3; // Max attempts to send message
const TAB_QUERY_RETRY_DELAY_MS = 300; // Initial delay, increases per attempt
const BADGE_ERROR_TEXT_GENERIC = "ERR"; // Generic error
const BADGE_ERROR_COLOR_GENERIC = "#D93025"; // Google Red
const BADGE_ERROR_TEXT_COMMS = "!"; // Content script comms issue
const BADGE_ERROR_COLOR_COMMS = "#FDB813"; // Yellow/Orange
const BADGE_ERROR_TEXT_AUTH = "KEY"; // API Key / Auth issue
const BADGE_ERROR_COLOR_AUTH = "#D93025"; // Red
const BADGE_ERROR_TEXT_QUOTA = "QTY"; // Quota issue
const BADGE_ERROR_COLOR_QUOTA = "#FFA500"; // Orange

console.log("BubbleTranslate BG: Service Worker Started.");

// ============================================================================
// Badge Utility Functions (Refined)
// ============================================================================

/** Sets a badge on the extension icon with specific text and color. */
function setBadge(
	text: string,
	color: string,
	tooltip?: string // Optional tooltip
): void {
	// Use chrome.action consistently
	chrome.action.setBadgeText({ text: text });
	chrome.action.setBadgeBackgroundColor({ color: color });
	if (tooltip) {
		chrome.action.setTitle({ title: tooltip });
	} else {
		// Reset title if no specific tooltip provided for this badge
		chrome.action.setTitle({ title: "BubbleTranslate" });
	}
	// console.log( // Reduce noise
	// 	`BubbleTranslate BG: Set badge: Text='${text}', Color='${color}' ${
	// 		tooltip ? `Tooltip='${tooltip}'` : ""
	// 	}`
	// );
}

/** Sets an error badge based on the type of error (primarily for comms errors here). */
function setErrorBadge(context: string, error?: unknown): void {
	let message = "An error occurred";
	if (error instanceof Error) message = error.message;

	// Check specifically for the connection error message
	if (
		message.includes("Could not establish connection") ||
		message.includes("Receiving end does not exist")
	) {
		setBadge(
			BADGE_ERROR_TEXT_COMMS,
			BADGE_ERROR_COLOR_COMMS,
			`Cannot connect to page content script. Try reloading the page or check extension permissions. (Context: ${context})`
		);
	} else {
		// Generic error badge if caught in background
		setBadge(
			BADGE_ERROR_TEXT_GENERIC,
			BADGE_ERROR_COLOR_GENERIC,
			`Background error: ${message.substring(0, 60)}... (Context: ${context})`
		);
	}
}

/** Clears the badge text and background color, resets title. */
function clearBadge(): void {
	chrome.action.setBadgeText({ text: "" });
	chrome.action.setTitle({ title: "BubbleTranslate" }); // Reset to default title
}

// ============================================================================
// Event Listeners
// ============================================================================

chrome.runtime.onMessage.addListener(
	(
		request: BackgroundMessage | any, // Type any for initial validation
		sender: chrome.runtime.MessageSender,
		sendResponse: (response: BackgroundResponse) => void
	): boolean => {
		// Basic validation
		if (!request || typeof request.action !== "string") {
			console.warn(
				"BubbleTranslate BG: Received invalid message format.",
				request
			);
			return false;
		}
		if (!sender.id || sender.id !== chrome.runtime.id) {
			console.warn(
				`BubbleTranslate BG: Received message from unexpected sender ID: ${
					sender.id || "N/A"
				}. Ignoring.`
			);
			return false;
		}

		let isAsync = false;
		const action = request.action as MessageAction;

		switch (action) {
			case ACTION_START_TRANSLATION:
				console.log(
					"BubbleTranslate BG: Received 'startTranslation', triggering content script analysis."
				);
				clearBadge();

				triggerAnalysisOnTargetTab(1).catch((error) => {
					console.error(
						"BubbleTranslate BG: Final failure during triggerAnalysis:",
						error
					);
					// Badge is set within triggerAnalysisOnTargetTab on final failure
				});

				sendResponse({
					status: "received",
					message:
						"Background acknowledged startTranslation, triggering analysis.",
				});
				break; // Important: Add break statement

			case ACTION_PROCESS_IMAGE:
				const processMsg = request as ProcessImageMessage;
				const tabId = sender.tab?.id;

				if (tabId && processMsg.imageUrl && processMsg.imageId) {
					processImageAndTranslateBlocks(
						processMsg.imageUrl,
						processMsg.imageId,
						tabId
					).catch((unexpectedError) => {
						console.error(
							`BubbleTranslate BG: UNEXPECTED critical error processing image [${processMsg.imageId}] in tab [${tabId}]:`,
							unexpectedError
						);
						setErrorBadge(
							`Processing img ${processMsg.imageId}`,
							unexpectedError
						);
					});
					isAsync = true; // Signal async work
				} else {
					console.error(
						"BubbleTranslate BG: Invalid 'processImage' request received.",
						request,
						`Tab ID: ${tabId}`
					);
				}
				// No sendResponse for processImage
				break; // Important: Add break statement

			default:
				console.log(`BubbleTranslate BG: Received unhandled action: ${action}`);
				sendResponse({
					status: "unknown",
					message: `Unhandled action: ${action}`,
				});
				break; // Important: Add break statement
		}

		return isAsync;
	}
);

console.log("BubbleTranslate BG: Message listener added.");

// ============================================================================
// Trigger Logic (Revised with Refined Error Handling)
// ============================================================================

/**
 * Attempts to find the last focused, normal browser window and trigger analysis
 * on its active tab. Includes retry logic and badge notifications.
 */
async function triggerAnalysisOnTargetTab(attempt: number): Promise<void> {
	const context = `TriggerAnalysis Attempt ${attempt}/${MAX_TAB_QUERY_ATTEMPTS}`;
	// console.log(`BubbleTranslate BG: ${context}`); // Reduce noise

	try {
		// Find target window and tab
		const lastFocusedWindow = await chrome.windows.getLastFocused({
			populate: false,
			windowTypes: ["normal"],
		});
		if (!lastFocusedWindow?.id || lastFocusedWindow.state === "minimized") {
			throw new Error(
				`Last focused window not found, invalid, or minimized (ID: ${lastFocusedWindow?.id}, State: ${lastFocusedWindow?.state}).`
			);
		}
		const tabs = await chrome.tabs.query({
			active: true,
			windowId: lastFocusedWindow.id,
		});
		const activeTab = tabs?.[0];
		const activeTabId = activeTab?.id;
		const activeTabUrl = activeTab?.url;

		if (!activeTabId || !activeTabUrl) {
			throw new Error(
				`No active tab found or URL missing in window ${lastFocusedWindow.id}.`
			);
		}

		// Check for restricted URLs
		if (
			activeTabUrl.startsWith("chrome://") ||
			activeTabUrl.startsWith("edge://") ||
			activeTabUrl.startsWith("about:") ||
			activeTabUrl.startsWith("file://")
		) {
			// Also block file:// URLs as content scripts often have issues there without specific permissions
			console.warn(
				`BubbleTranslate BG: Target tab ${activeTabId} is a restricted URL (${activeTabUrl}). Skipping trigger.`
			);
			throw new Error(
				`Cannot trigger analysis on restricted URL: ${activeTabUrl}`
			);
		}

		console.log(
			`BubbleTranslate BG: Found active tab ${activeTabId}. Sending trigger (${context}).`
		);
		const message: TriggerAnalysisMessage = { action: ACTION_TRIGGER_ANALYSIS };

		// --- Attempt to send message ---
		try {
			const response = await chrome.tabs.sendMessage<
				TriggerAnalysisMessage,
				AnalysisResponseMessage
			>(activeTabId, message);
			console.log(
				`BubbleTranslate BG: Content script response from tab ${activeTabId}:`,
				response
			);

			// Handle response status
			if (!response) {
				// Should not happen if sendMessage resolves, but check defensively
				throw new Error("Content script responded with undefined/null.");
			}
			if (response.status === "error") {
				console.error(
					`BubbleTranslate BG: Content script reported error: ${response.error}`
				);
				setBadge(
					"ERR",
					BADGE_ERROR_COLOR_COMMS,
					`Page analysis failed: ${response.error?.substring(0, 50)}...`
				);
			} else if (
				response.status === "noImagesFound" ||
				(response.status === "processingImages" && response.sentCount === 0)
			) {
				clearBadge();
				chrome.action.setTitle({
					title: "BubbleTranslate: No new images found to translate.",
				});
			} else if (response.status === "processingImages") {
				clearBadge();
				chrome.action.setTitle({
					title: `BubbleTranslate: Processing ${response.sentCount} images...`,
				});
			} else {
				console.warn(
					"BubbleTranslate BG: Received unexpected response status from content script:",
					response.status
				);
				clearBadge();
			}
			// --- Success or known content script error: Stop retrying ---
			return;
		} catch (error: unknown) {
			// --- Handle chrome.tabs.sendMessage specific errors ---
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			// Check specifically for the connection error
			if (
				errorMessage.includes("Could not establish connection") ||
				errorMessage.includes("Receiving end does not exist")
			) {
				console.warn(
					`BubbleTranslate BG: ${context} - Failed to connect to content script in tab ${activeTabId}. It might be loading or unavailable. Error: ${errorMessage}`
				);
				// This error will be caught by the outer catch, triggering a retry if applicable
			} else {
				// Different error occurred during sendMessage (e.g., tab closed, misc internal error)
				console.warn(
					`BubbleTranslate BG: ${context} - Error sending message to tab ${activeTabId}: ${errorMessage}`
				);
			}
			// Re-throw the error to be handled by the outer catch (for retries)
			throw error;
		}
	} catch (error: unknown) {
		// Catch errors from tab/window queries or re-thrown sendMessage errors
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.warn(`BubbleTranslate BG: ${context} - Error: ${errorMessage}`);

		// --- Retry Logic ---
		if (attempt < MAX_TAB_QUERY_ATTEMPTS) {
			// Exponential backoff for retry delay (or simple linear like before)
			// const delay = TAB_QUERY_RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential
			const delay = TAB_QUERY_RETRY_DELAY_MS * attempt; // Linear backoff
			console.log(`BubbleTranslate BG: Retrying in ${delay}ms...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
			await triggerAnalysisOnTargetTab(attempt + 1); // Await the next attempt
		} else {
			// --- Final Failure ---
			console.error(
				`BubbleTranslate BG: Failed to find/message active tab after ${MAX_TAB_QUERY_ATTEMPTS} attempts. Last error: ${errorMessage}`
			);
			setErrorBadge(context, error); // Set final error badge based on the last error
			// Re-throw the final error so the initial caller (.catch in onMessage) knows it ultimately failed
			throw new Error(
				`Failed final attempt to trigger analysis (${context}): ${errorMessage}`
			);
		}
	}
}
