// src/core/background.ts
import { processImageAndTranslateBlocks } from "@features/translation/translation_service";
import type {
	BackgroundMessage,
	BackgroundResponse,
	MessageAction,
	ProcessImageMessage,
	TriggerAnalysisMessage,
	AnalysisResponseMessage,
} from "@shared/types";

// --- Constants ---
const ACTION_START_TRANSLATION: MessageAction = "startTranslation";
const ACTION_PROCESS_IMAGE: MessageAction = "processImage";
const ACTION_TRIGGER_ANALYSIS: MessageAction = "triggerPageAnalysis";
const MAX_TAB_QUERY_ATTEMPTS = 3;
const TAB_QUERY_RETRY_DELAY_MS = 200;
const BADGE_ERROR_TEXT = "ERR";
const BADGE_ERROR_COLOR = "#FF0000"; // Red

console.log("BubbleTranslate BG: Service Worker Started.");

// ============================================================================
// Badge Utility Functions
// ============================================================================

/** Sets an error badge on the extension icon. */
function setErrorBadge(
	text: string = BADGE_ERROR_TEXT,
	color: string = BADGE_ERROR_COLOR
): void {
	chrome.action.setBadgeText({ text: text });
	chrome.action.setBadgeBackgroundColor({ color: color });
	console.log(
		`BubbleTranslate BG: Set error badge: Text='${text}', Color='${color}'`
	);
}

/** Clears the badge text and background color. */
function clearBadge(): void {
	chrome.action.setBadgeText({ text: "" });
	console.log("BubbleTranslate BG: Cleared badge.");
}

// ============================================================================
// Event Listeners
// ============================================================================

chrome.runtime.onMessage.addListener(
	(
		request: BackgroundMessage | any,
		sender: chrome.runtime.MessageSender,
		sendResponse: (response: BackgroundResponse) => void
	): boolean => {
		// Basic validation of the incoming request
		if (!request || typeof request.action !== "string") {
			console.warn(
				"BubbleTranslate BG: Received invalid message format.",
				request
			);
			return false;
		}

		let isAsync = false;

		switch (request.action) {
			case ACTION_START_TRANSLATION:
				console.log(
					"BubbleTranslate BG: Received 'startTranslation', triggering content script analysis."
				);
				// --- Clear any previous error badge on new attempt ---
				clearBadge();
				// ----------------------------------------------------

				// Call the function to find the tab and send the message
				triggerAnalysisOnTargetTab(1).catch((error) => {
					// Catch potential unhandled promise rejection from triggerAnalysisOnTargetTab
					// This might happen if an error occurs outside the internal retry catch
					console.error(
						"BubbleTranslate BG: Uncaught error during triggerAnalysis:",
						error
					);
					setErrorBadge();
				});
				// Send an immediate acknowledgement back to the popup
				sendResponse({
					status: "received",
					message: "Background acknowledged startTranslation.",
				});
				break;

			case ACTION_PROCESS_IMAGE:
				const processMsg = request as ProcessImageMessage;
				if (sender.tab?.id && processMsg.imageUrl && processMsg.imageId) {
					console.log(
						`BubbleTranslate BG: Queuing processing for image [${processMsg.imageId}] in tab [${sender.tab.id}]`
					);
					processImageAndTranslateBlocks(
						processMsg.imageUrl,
						processMsg.imageId,
						sender.tab.id
					).catch((error) => {
						console.error(
							`BubbleTranslate BG: Error processing image ${processMsg.imageId}:`,
							error
						);
						setErrorBadge("IMG", "#FFA500"); // Example: Orange badge for image error
					});
					isAsync = true; // Indicate background work continues
				} else {
					console.error(
						"BubbleTranslate BG: Invalid 'processImage' request received.",
						request
					);
				}
				break;

			default:
				console.log(
					`BubbleTranslate BG: Received unhandled action: ${request.action}`
				);
				break;
		}

		// Return true if any background async work relevant to the listener's response might occur.
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
	// Returns Promise<void>
	console.log(
		`BubbleTranslate BG: Attempting to find target tab (Attempt ${attempt}/${MAX_TAB_QUERY_ATTEMPTS}).`
	);
	try {
		const lastFocusedWindow = await chrome.windows.getLastFocused({
			populate: false,
			windowTypes: ["normal"],
		});

		if (!lastFocusedWindow?.id || lastFocusedWindow.state === "minimized") {
			throw new Error(
				`Last focused window not found, invalid, or minimized (ID: ${lastFocusedWindow?.id}, State: ${lastFocusedWindow?.state}).`
			);
		}
		console.log(
			`BubbleTranslate BG: Found last focused normal window ID: ${lastFocusedWindow.id}`
		);

		const tabs = await chrome.tabs.query({
			active: true,
			windowId: lastFocusedWindow.id,
		});

		const activeTab = tabs?.[0];
		const activeTabId = activeTab?.id;

		if (activeTabId !== undefined) {
			console.log(
				`BubbleTranslate BG: Found active tab ${activeTabId} in window ${lastFocusedWindow.id}. Sending trigger.`
			);
			const message: TriggerAnalysisMessage = { action: "triggerPageAnalysis" };

			try {
				const response = await chrome.tabs.sendMessage<
					TriggerAnalysisMessage,
					AnalysisResponseMessage
				>(activeTabId, message);

				console.log(
					`BubbleTranslate BG: Content script response for '${message.action}' from tab ${activeTabId}:`,
					response
				);
				// --- Success: Clear badge if it was previously set ---
				clearBadge();
				// -----------------------------------------------------
			} catch (error) {
				// Error sending message or receiving response (e.g., content script not ready)
				console.warn(
					`BubbleTranslate BG: Could not send/receive '${
						message.action
					}' to tab ${activeTabId}. Error: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
				// --- Set error badge on communication failure with content script ---
				setErrorBadge("!");
				// --------------------------------------------------------------------
				// Re-throw the error so the outer catch handles retries/final failure
				throw error;
			}
		} else {
			throw new Error(`No active tab found in window ${lastFocusedWindow.id}.`);
		}
	} catch (error) {
		// Catch errors from window/tab queries or re-thrown errors from sendMessage
		console.warn(
			`BubbleTranslate BG: Error finding/messaging tab (Attempt ${attempt}): ${
				error instanceof Error ? error.message : String(error)
			}`
		);

		if (attempt < MAX_TAB_QUERY_ATTEMPTS) {
			console.log(
				`BubbleTranslate BG: Retrying in ${
					TAB_QUERY_RETRY_DELAY_MS * attempt
				}ms...`
			);
			await new Promise((resolve) =>
				setTimeout(resolve, TAB_QUERY_RETRY_DELAY_MS * attempt)
			);
			// Await the retry attempt. If it throws, it will propagate up if not caught later.
			await triggerAnalysisOnTargetTab(attempt + 1);
		} else {
			console.error(
				`BubbleTranslate BG: Failed to find and message active tab after ${MAX_TAB_QUERY_ATTEMPTS} attempts.`
			);
			// --- FINAL FAILURE: Set the error badge ---
			setErrorBadge(); // Use default "ERR" and red color
			// --------------------------------------------
			// Optional: Throw error here if the caller (onMessage listener) needs to know about the final failure
			throw new Error(
				`Failed final attempt to trigger analysis: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}
}
