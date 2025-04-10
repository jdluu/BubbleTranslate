// --- Put this at the very top of content.js ---
console.log("BubbleTranslate: Content Script Loaded!");
// ----------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log("BubbleTranslate: Message received in content script:", message);

	switch (message.action) {
		case "triggerPageAnalysis":
			console.log("BubbleTranslate: 'triggerPageAnalysis' action received.");
			let imagesFoundCount = 0; // Keep track of count
			let processingError = null;

			try {
				// --- CORRECTED: Call findPotentialMangaImages and loop here ---
				const images = findPotentialMangaImages(); // Call the existing function
				imagesFoundCount = images.length; // Store count
				console.log(
					`BubbleTranslate: Found ${imagesFoundCount} potential images.`
				);

				// --- Try to send messages back ---
				images.forEach((img) => {
					try {
						if (img && img.src) {
							console.log(
								`BubbleTranslate: Sending image URL to background: ${img.src.substring(
									0,
									100
								)}...`
							);
							// Send message back to background for each image
							chrome.runtime.sendMessage({
								action: "processImage",
								imageUrl: img.src,
							});
						} else {
							console.warn(
								"BubbleTranslate: Skipping image send - invalid img object or src.",
								img
							);
						}
					} catch (sendError) {
						console.error(
							"BubbleTranslate: Error sending 'processImage' message for one image:",
							sendError,
							"Image:",
							img
						);
						if (!processingError) processingError = sendError;
					}
				});
				// --------------------------------------------------------------
			} catch (findError) {
				console.error(
					"BubbleTranslate: Error during image finding/processing:",
					findError
				);
				processingError = findError;
			} finally {
				console.log(
					"BubbleTranslate: Reached end of 'triggerPageAnalysis' block. Sending response to background."
				);
				if (processingError) {
					sendResponse({
						status: "error",
						error: processingError.message || "Unknown content script error",
						foundCount: imagesFoundCount,
					});
				} else {
					// Send count back based on the actual images found
					sendResponse({
						status: "processingImages",
						foundCount: imagesFoundCount,
					});
				}
			}
			// Return true because logic inside try/catch might theoretically be async later,
			// and sendResponse is in finally. Safer to include.
			return true;

		// --- Cases for displayTranslation and translationError remain the same ---
		case "displayTranslation":
			console.log(
				`   Received translation for ${message.originalImageUrl.substring(
					0,
					60
				)}...`
			);
			displayTranslationOverlay(
				message.originalImageUrl,
				message.translatedText
			);
			return false; // Indicate no response needed

		case "translationError":
			console.warn(
				`   Received error for ${message.originalImageUrl.substring(
					0,
					60
				)}...: ${message.error}`
			);
			displayErrorOverlay(message.originalImageUrl, message.error);
			return false; // Indicate no response needed

		default:
			console.log(
				`BubbleTranslate Content Script: Received unknown action: ${message.action}`
			);
			return false; // Indicate no response needed
	}
});

// --- NEW FUNCTION to display the translation overlay ---
function displayTranslationOverlay(imageUrl, translatedText) {
	// Find the image element on the page using its src
	// Need to escape quotes within the querySelector if the URL contains them (unlikely but possible)
	const escapedUrl = imageUrl.replace(/"/g, '\\"');
	const imgElement = document.querySelector(`img[src="${escapedUrl}"]`);

	if (imgElement) {
		console.log(`   Found image element for ${imageUrl.substring(0, 60)}...`);

		// --- Basic Overlay Creation ---
		// Check if an overlay already exists for this image to prevent duplicates
		if (imgElement.dataset.translationDisplayed === "true") {
			console.log(
				`   Overlay already exists for ${imageUrl.substring(
					0,
					60
				)}..., skipping.`
			);
			return;
		}

		// Create the overlay div
		const overlayDiv = document.createElement("div");
		overlayDiv.textContent = translatedText;
		overlayDiv.style.position = "absolute"; // Position relative to the nearest positioned ancestor
		overlayDiv.style.bottom = "10px"; // Position near the bottom of the image
		overlayDiv.style.left = "10px"; // Position near the left of the image
		overlayDiv.style.right = "10px"; // Stretch near the right edge
		overlayDiv.style.backgroundColor = "rgba(0, 0, 0, 0.75)"; // Semi-transparent black background
		overlayDiv.style.color = "white"; // White text
		overlayDiv.style.padding = "5px"; // Some padding
		overlayDiv.style.fontSize = "14px"; // Readable font size
		overlayDiv.style.zIndex = "9999"; // Ensure it's on top
		overlayDiv.style.borderRadius = "4px"; // Slightly rounded corners
		overlayDiv.style.textAlign = "center"; // Center the text
		overlayDiv.style.pointerEvents = "none"; // Allow clicks to pass through to the image if needed

		// --- Positioning Strategy: Wrap the image ---
		// Get the parent of the image
		const parent = imgElement.parentNode;

		// Create a wrapper div if it doesn't exist already (or if the parent isn't already a wrapper)
		let wrapper = parent;
		// Basic check if parent might already be a wrapper (more robust checks could be added)
		if (
			getComputedStyle(parent).position !== "relative" &&
			getComputedStyle(parent).position !== "absolute" &&
			getComputedStyle(parent).position !== "fixed"
		) {
			console.log(`   Wrapping image ${imageUrl.substring(0, 60)}...`);
			wrapper = document.createElement("div");
			wrapper.style.position = "relative"; // Make the wrapper the positioning context
			wrapper.style.display = "inline-block"; // Keep layout similar to original image
			// Move the image inside the wrapper
			parent.insertBefore(wrapper, imgElement);
			wrapper.appendChild(imgElement);
		} else {
			console.log(
				`   Parent of image ${imageUrl.substring(
					0,
					60
				)}... is already positioned.`
			);
		}

		// Append the overlay to the wrapper (which is either the new wrapper or the original parent if it was already positioned)
		wrapper.appendChild(overlayDiv);

		// Mark the image so we don't add another overlay later if the message comes again
		imgElement.dataset.translationDisplayed = "true";

		console.log(`   Overlay added for ${imageUrl.substring(0, 60)}...`);
	} else {
		console.warn(
			`   Could not find image element for ${imageUrl} on the page.`
		);
	}
}

// --- Optional: Function to display an error ---
function displayErrorOverlay(imageUrl, errorMessage) {
	const escapedUrl = imageUrl.replace(/"/g, '\\"');
	const imgElement = document.querySelector(`img[src="${escapedUrl}"]`);
	if (imgElement && imgElement.dataset.translationDisplayed !== "true") {
		// Check if overlay exists
		const errorDiv = document.createElement("div");
		errorDiv.textContent = `⚠️ Error`; // Simple error indicator
		errorDiv.title = errorMessage; // Show full error on hover
		errorDiv.style.position = "absolute";
		errorDiv.style.top = "10px";
		errorDiv.style.left = "10px";
		errorDiv.style.backgroundColor = "rgba(255, 0, 0, 0.7)"; // Red background
		errorDiv.style.color = "white";
		errorDiv.style.padding = "2px 5px";
		errorDiv.style.fontSize = "12px";
		errorDiv.style.zIndex = "10000";
		errorDiv.style.borderRadius = "4px";
		errorDiv.style.pointerEvents = "none"; // Allow clicks through

		// Use the same wrapping logic as displayTranslationOverlay
		const parent = imgElement.parentNode;
		let wrapper = parent;
		if (
			getComputedStyle(parent).position !== "relative" &&
			getComputedStyle(parent).position !== "absolute" &&
			getComputedStyle(parent).position !== "fixed"
		) {
			wrapper = document.createElement("div");
			wrapper.style.position = "relative";
			wrapper.style.display = "inline-block";
			parent.insertBefore(wrapper, imgElement);
			wrapper.appendChild(imgElement);
		}
		wrapper.appendChild(errorDiv);
		imgElement.dataset.translationDisplayed = "true"; // Mark as processed even for error
		console.log(`   Error overlay added for ${imageUrl.substring(0, 60)}...`);
	}
}
// (Keep the findPotentialMangaImages function with its detailed logging from the previous step here)
/**
 * Finds potential manga/comic images on the page...
 * (Includes the detailed console.log for Width/Height/Src for every image)
 */
function findPotentialMangaImages() {
	console.log("BubbleTranslate: --- Starting Image Search ---");
	const allImages = document.querySelectorAll("img");
	const potentialImages = [];
	const minWidth = 300; // Minimum width threshold
	const minHeight = 400; // Minimum height threshold

	console.log(
		`BubbleTranslate: Found ${allImages.length} total <img> tags. Checking dimensions...`
	);

	allImages.forEach((img, index) => {
		const width =
			img.naturalWidth ||
			img.offsetWidth ||
			parseInt(img.getAttribute("width")) ||
			0;
		const height =
			img.naturalHeight ||
			img.offsetHeight ||
			parseInt(img.getAttribute("height")) ||
			0;
		console.log(
			`BubbleTranslate: Image[${index}] | Width: ${width}, Height: ${height} | Src: ${img.src.substring(
				0,
				100
			)}...`
		);

		if (width >= minWidth && height >= minHeight) {
			if (
				img.src &&
				(img.src.startsWith("http") || img.src.startsWith("data:"))
			) {
				console.log(
					`%cBubbleTranslate: ---> Image[${index}] MET criteria! Adding.`,
					"color: green; font-weight: bold;"
				);
				potentialImages.push(img);
			} else {
				console.log(
					`BubbleTranslate: ---> Image[${index}] dimensions OK, but src invalid/missing.`
				);
			}
		}
		// No need to log rejected ones unless debugging that specifically
	});

	console.log(
		`BubbleTranslate: --- Finished Image Search. Found ${potentialImages.length} potential images meeting criteria. ---`
	);
	return potentialImages;
}

console.log("BubbleTranslate: Content Script listener added."); // Keep this outside listener
