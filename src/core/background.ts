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

const MAX_TAB_QUERY_ATTEMPTS = 3;
const TAB_QUERY_RETRY_DELAY_MS = 200;
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
	chrome.action.setBadgeText({ text: text });
	chrome.action.setBadgeBackgroundColor({ color: color });
	if (tooltip) {
		chrome.action.setTitle({ title: tooltip });
	}
	console.log(
		`BubbleTranslate BG: Set badge: Text='${text}', Color='${color}' ${
			tooltip ? `Tooltip='${tooltip}'` : ""
		}`
	);
}

/** Sets an error badge based on the type of error. */
function setErrorBadge(error?: unknown): void {
	// Future: Use error type for more specific badges (e.g., Auth, Quota)
	// For now, keep the basic error badge for communication issues or generic errors caught here.
	// The detailed errors (API Key, Quota) will be sent to the content script overlay.
	// We might set a specific badge if an error is caught *here* in the background unexpectedly.
	if (
		error instanceof Error &&
		error.message.includes("Could not establish connection")
	) {
		setBadge(
			BADGE_ERROR_TEXT_COMMS,
			BADGE_ERROR_COLOR_COMMS,
			"Error communicating with page content script."
		);
	} else {
		setBadge(
			BADGE_ERROR_TEXT_GENERIC,
			BADGE_ERROR_COLOR_GENERIC,
			"An error occurred."
		);
	}
}

/** Clears the badge text and background color, resets title. */
function clearBadge(): void {
	chrome.action.setBadgeText({ text: "" });
	chrome.action.setTitle({ title: "BubbleTranslate" }); // Reset to default title
	// console.log("BubbleTranslate BG: Cleared badge."); // Reduce log noise
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
		// Basic validation of the incoming request
		if (!request || typeof request.action !== "string") {
			console.warn(
				"BubbleTranslate BG: Received invalid message format.",
				request
			);
			// Cannot send response if format is wrong, return false
			return false;
		}

		// Check if message is from our extension's content script or popup
		// Avoid processing messages from other extensions or potentially malicious sources
		if (!sender.id || sender.id !== chrome.runtime.id) {
			console.warn(
				`BubbleTranslate BG: Received message from unexpected sender ID: ${
					sender.id || "N/A"
				}. Ignoring.`
			);
			return false;
		}

		let isAsync = false;

		// Explicitly cast to known message types within the switch for type safety
		const action = request.action as MessageAction;

		switch (action) {
			// Message usually from POPUP to initiate analysis on the current page
			case ACTION_START_TRANSLATION:
				console.log(
					"BubbleTranslate BG: Received 'startTranslation', triggering content script analysis."
				);
				// Clear any previous error badge on new user attempt
				clearBadge();

				// Call the function to find the tab and send the trigger message
				triggerAnalysisOnTargetTab(1).catch((error) => {
					// This catch handles the *final* error after retries fail in triggerAnalysisOnTargetTab
					console.error(
						"BubbleTranslate BG: Final failure during triggerAnalysis:",
						error
					);
					// Badge is already set by the failing function, no need to set again here
					// Optionally report this failure back to popup if it's still open? (More complex)
				});
				// Send an immediate acknowledgement back to the sender (popup)
				sendResponse({
					status: "received",
					message:
						"Background acknowledged startTranslation, triggering analysis.",
				});
				break;

			// Message from CONTENT SCRIPT requesting processing for a specific image
			case ACTION_PROCESS_IMAGE:
				const processMsg = request as ProcessImageMessage;
				const tabId = sender.tab?.id; // Get tab ID from the sender

				if (tabId && processMsg.imageUrl && processMsg.imageId) {
					// console.log( // Reduce log noise slightly
					// 	`BubbleTranslate BG: Queuing processing for image [${processMsg.imageId}] in tab [${tabId}]`
					// );

					// *** IMPORTANT ***
					// processImageAndTranslateBlocks now handles its own errors internally
					// and sends structured errors *directly to the content script* via sendStructuredError.
					// We only need to catch truly unexpected errors *here* that might crash the process.
					// We don't typically send a response back to the content script for this message.
					processImageAndTranslateBlocks(
						processMsg.imageUrl,
						processMsg.imageId,
						tabId
					).catch((unexpectedError) => {
						// This catch block is for errors *not* handled within processImageAndTranslateBlocks
						// (e.g., if the function itself has a critical bug, though API errors etc. are handled inside).
						console.error(
							`BubbleTranslate BG: UNEXPECTED critical error processing image [${processMsg.imageId}] in tab [${tabId}]:`,
							unexpectedError
						);
						// Set a generic error badge, as this indicates a background script problem
						setErrorBadge(unexpectedError);
						// Optionally, try sending a generic error back to the content script if possible?
						// This might be difficult if the error is severe.
					});
					isAsync = true; // Indicate background work continues, crucial for processImageAndTranslateBlocks
				} else {
					console.error(
						"BubbleTranslate BG: Invalid 'processImage' request received.",
						request,
						`Tab ID: ${tabId}`
					);
					// Cannot send response back easily, content script initiated this
				}
				// No sendResponse needed here as the content script doesn't wait for a response for 'processImage'
				break;

			default:
				console.log(`BubbleTranslate BG: Received unhandled action: ${action}`);
				// Send a generic response if a response is expected but action is unknown
				sendResponse({
					status: "unknown",
					message: `Unhandled action: ${action}`,
				});
				break;
		}

		// Return true ONLY if we are performing async operations *and* might use sendResponse later.
		// In this refactor, only ACTION_PROCESS_IMAGE is truly async without an immediate sendResponse.
		// ACTION_START_TRANSLATION sends response immediately but starts async work.
		// The 'return true' mainly keeps the message channel open for async sendResponse.
		// Since processImage doesn't use sendResponse, returning true is technically needed just to signal async work continues.
		return isAsync;
	}
);

console.log("BubbleTranslate BG: Message listener added.");

// ============================================================================
// Trigger Logic (Revised with Badge Handling)
// ============================================================================

/**
 * Attempts to find the last focused, normal browser window and trigger analysis
 * on its active tab. Includes retry logic and badge notifications.
 */
async function triggerAnalysisOnTargetTab(attempt: number): Promise<void> {
	console.log(
		`BubbleTranslate BG: Attempting to find target tab (Attempt ${attempt}/${MAX_TAB_QUERY_ATTEMPTS}).`
	);
	try {
		const lastFocusedWindow = await chrome.windows.getLastFocused({
			populate: false, // Don't need tab info yet
			windowTypes: ["normal"],
		});

		if (!lastFocusedWindow?.id || lastFocusedWindow.state === "minimized") {
			throw new Error(
				`Last focused window not found, invalid, or minimized (ID: ${lastFocusedWindow?.id}, State: ${lastFocusedWindow?.state}).`
			);
		}
		// console.log( // Reduce noise
		// 	`BubbleTranslate BG: Found last focused normal window ID: ${lastFocusedWindow.id}`
		// );

		const tabs = await chrome.tabs.query({
			active: true,
			windowId: lastFocusedWindow.id,
		});

		const activeTab = tabs?.[0];
		const activeTabId = activeTab?.id;
		const activeTabUrl = activeTab?.url; // Get URL for logging/checks

		if (activeTabId !== undefined && activeTabUrl) {
			// Basic check to avoid trying to inject into chrome:// or other restricted pages
			if (
				activeTabUrl.startsWith("chrome://") ||
				activeTabUrl.startsWith("edge://") ||
				activeTabUrl.startsWith("about:")
			) {
				console.warn(
					`BubbleTranslate BG: Target tab ${activeTabId} is a restricted URL (${activeTabUrl}). Skipping trigger.`
				);
				throw new Error(
					`Cannot trigger analysis on restricted URL: ${activeTabUrl}`
				);
			}

			console.log(
				`BubbleTranslate BG: Found active tab ${activeTabId} in window ${lastFocusedWindow.id}. Sending trigger.`
			);
			const message: TriggerAnalysisMessage = {
				action: ACTION_TRIGGER_ANALYSIS,
			};

			try {
				// Send message and wait for response from content script
				const response = await chrome.tabs.sendMessage<
					TriggerAnalysisMessage,
					AnalysisResponseMessage // Expect this response structure
				>(activeTabId, message);

				console.log(
					`BubbleTranslate BG: Content script response for '${message.action}' from tab ${activeTabId}:`,
					response // Log the structured response
				);

				// Handle response status from content script
				if (response?.status === "error") {
					console.error(
						`BubbleTranslate BG: Content script reported an error during analysis: ${response.error}`
					);
					// Set a badge indicating content script had an issue? Or rely on overlay errors?
					// Let's set a subtle badge for now.
					setBadge(
						"ERR",
						BADGE_ERROR_COLOR_COMMS,
						`Page analysis failed: ${response.error?.substring(0, 50)}...`
					);
				} else if (
					response?.status === "processingImages" &&
					response.sentCount === 0
				) {
					// Optionally clear badge or set specific "no images" badge/tooltip
					clearBadge();
					chrome.action.setTitle({
						title: "BubbleTranslate: No new images found to translate.",
					});
				} else if (response?.status === "processingImages") {
					// Success: Clear badge if it was previously set
					clearBadge();
					chrome.action.setTitle({
						title: `BubbleTranslate: Processing ${response.sentCount} images...`,
					});
				} else {
					// Unexpected response structure
					console.warn(
						"BubbleTranslate BG: Received unexpected response structure from content script:",
						response
					);
					clearBadge(); // Clear any error badge from trying to send
				}
			} catch (error) {
				// Error sending message or receiving response (content script not ready, rejected promise, etc.)
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				console.warn(
					`BubbleTranslate BG: Could not send/receive '${message.action}' to tab ${activeTabId}. Error: ${errorMessage}`
				);
				// Set error badge on communication failure
				setErrorBadge(error); // Pass error for context
				// Re-throw the error so the outer catch handles retries/final failure
				throw error;
			}
		} else {
			throw new Error(`No active tab found in window ${lastFocusedWindow.id}.`);
		}
	} catch (error) {
		// Catch errors from window/tab queries, restricted URL check, or re-thrown errors from sendMessage
		console.warn(
			`BubbleTranslate BG: Error finding/messaging tab (Attempt ${attempt}): ${
				error instanceof Error ? error.message : String(error)
			}`
		);

		if (attempt < MAX_TAB_QUERY_ATTEMPTS) {
			const delay = TAB_QUERY_RETRY_DELAY_MS * attempt;
			console.log(`BubbleTranslate BG: Retrying in ${delay}ms...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
			// Await the retry attempt.
			await triggerAnalysisOnTargetTab(attempt + 1);
		} else {
			const finalErrorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(
				`BubbleTranslate BG: Failed to find and message active tab after ${MAX_TAB_QUERY_ATTEMPTS} attempts. Last error: ${finalErrorMessage}`
			);
			// FINAL FAILURE: Set the error badge
			setErrorBadge(error); // Pass final error for context
			// Optional: Throw error here if the caller (onMessage listener) needs to know about the final failure
			throw new Error(
				`Failed final attempt to trigger analysis: ${finalErrorMessage}`
			);
		}
	}
}
