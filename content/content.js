// --- Put this at the very top of content.js ---
console.log("BubbleTranslate: Content Script Loaded!");
// ----------------------------------------------

// --- Global variables for style settings ---
let overlayStyles = {
	fontSize: "14px", // Default values
	textColor: "#FFFFFF",
	bgColor: "rgba(0, 0, 0, 0.75)",
};

// --- Function to load settings from storage ---
function loadStyleSettings() {
	chrome.storage.local.get(
		{
			// Defaults matching options page
			fontSize: "14",
			textColor: "#FFFFFF",
			bgColor: "rgba(0, 0, 0, 0.75)",
		},
		(items) => {
			if (chrome.runtime.lastError) {
				console.error(
					"BubbleTranslate: Error loading style settings:",
					chrome.runtime.lastError
				);
				return;
			}
			// Update global styles object
			overlayStyles.fontSize = items.fontSize + "px"; // Add 'px' unit
			overlayStyles.textColor = items.textColor;
			overlayStyles.bgColor = items.bgColor;
			console.log("BubbleTranslate: Style settings loaded:", overlayStyles);
		}
	);
}

// --- Load settings when the script initially runs ---
loadStyleSettings();

// --- Optional: Listen for storage changes to update styles live ---
// (More advanced, requires careful handling)
/*
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.fontSize || changes.textColor || changes.bgColor)) {
    console.log("BubbleTranslate: Detected style change, reloading settings.");
    loadStyleSettings();
  }
});
*/

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log("BubbleTranslate: Message received in content script:", message);

	switch (message.action) {
		case "triggerPageAnalysis":
			console.log("BubbleTranslate: 'triggerPageAnalysis' action received.");
			// Reload styles just in case they changed before trigger
			let imagesFoundCount = 0; // Keep track of count
			let processingError = null;

			try {
				// --- Call findPotentialMangaImages and loop here ---
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
			// Return true because loadStyleSettings is async and sendResponse is in finally.
			return false;

		// --- Cases for displayTranslation and translationError ---
		case "displayTranslation":
			console.log(
				`   Received translation for ${message.originalImageUrl.substring(
					0,
					60
				)}...`
			);
			// Pass the loaded styles to the display function
			displayTranslationOverlay(
				message.originalImageUrl,
				message.translatedText,
				overlayStyles
			);
			return false; // Indicate no response needed

		case "translationError":
			console.warn(
				`   Received error for ${message.originalImageUrl.substring(
					0,
					60
				)}...: ${message.error}`
			);
			// Pass styles to error overlay too if you want consistency
			displayErrorOverlay(
				message.originalImageUrl,
				message.error,
				overlayStyles
			);
			return false; // Indicate no response needed

		default:
			console.log(
				`BubbleTranslate Content Script: Received unknown action: ${message.action}`
			);
			return false; // Indicate no response needed
	}
});

// --- MODIFIED FUNCTION to display the translation overlay ---
// Accepts 'styles' object as an argument
function displayTranslationOverlay(imageUrl, translatedText, styles) {
	// Find the image element on the page using its src
	const escapedUrl = imageUrl.replace(/"/g, '\\"');
	const imgElement = document.querySelector(`img[src="${escapedUrl}"]`);

	if (imgElement) {
		console.log(`   Found image element for ${imageUrl.substring(0, 60)}...`);
		if (imgElement.dataset.translationDisplayed === "true") {
			console.log(
				`   Overlay already exists for ${imageUrl.substring(
					0,
					60
				)}..., skipping.`
			);
			return;
		}

		const overlayDiv = document.createElement("div");
		overlayDiv.textContent = translatedText;

		// --- Apply styles from the passed 'styles' object ---
		overlayDiv.style.position = "absolute";
		overlayDiv.style.bottom = "10px";
		overlayDiv.style.left = "10px";
		overlayDiv.style.right = "10px";
		overlayDiv.style.backgroundColor = styles.bgColor; // Use loaded style
		overlayDiv.style.color = styles.textColor; // Use loaded style
		overlayDiv.style.padding = "5px";
		overlayDiv.style.fontSize = styles.fontSize; // Use loaded style
		overlayDiv.style.zIndex = "9999";
		overlayDiv.style.borderRadius = "4px";
		overlayDiv.style.textAlign = "center";
		overlayDiv.style.pointerEvents = "none";
		// --------------------------------------------------

		// --- Positioning Strategy: Wrap the image ---
		const parent = imgElement.parentNode;
		let wrapper = parent;
		if (
			getComputedStyle(parent).position !== "relative" &&
			getComputedStyle(parent).position !== "absolute" &&
			getComputedStyle(parent).position !== "fixed"
		) {
			console.log(`   Wrapping image ${imageUrl.substring(0, 60)}...`);
			wrapper = document.createElement("div");
			wrapper.style.position = "relative";
			wrapper.style.display = "inline-block";
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

		wrapper.appendChild(overlayDiv);
		imgElement.dataset.translationDisplayed = "true";
		console.log(
			`   Overlay added for ${imageUrl.substring(0, 60)}... with custom styles.`
		);
	} else {
		console.warn(
			`   Could not find image element for ${imageUrl} on the page.`
		);
	}
}

// --- MODIFIED FUNCTION to display an error ---
// Accepts 'styles' object as an argument
function displayErrorOverlay(imageUrl, errorMessage, styles) {
	const escapedUrl = imageUrl.replace(/"/g, '\\"');
	const imgElement = document.querySelector(`img[src="${escapedUrl}"]`);
	if (imgElement && imgElement.dataset.translationDisplayed !== "true") {
		const errorDiv = document.createElement("div");
		errorDiv.textContent = `⚠️ Error`;
		errorDiv.title = errorMessage;
		errorDiv.style.position = "absolute";
		errorDiv.style.top = "10px";
		errorDiv.style.left = "10px";
		errorDiv.style.backgroundColor = "rgba(255, 0, 0, 0.7)"; // Keep error red
		errorDiv.style.color = styles.textColor; // Use custom text color
		errorDiv.style.padding = "2px 5px";
		errorDiv.style.fontSize = styles.fontSize; // Use custom font size
		errorDiv.style.zIndex = "10000";
		errorDiv.style.borderRadius = "4px";
		errorDiv.style.pointerEvents = "none";

		const parent = imgElement.parentNode;
		let wrapper = parent;
		if (getComputedStyle(parent).position !== "relative") {
			wrapper = document.createElement("div");
			wrapper.style.position = "relative";
			wrapper.style.display = "inline-block";
			parent.insertBefore(wrapper, imgElement);
			wrapper.appendChild(imgElement);
		}
		wrapper.appendChild(errorDiv);
		imgElement.dataset.translationDisplayed = "true";
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
	});

	console.log(
		`BubbleTranslate: --- Finished Image Search. Found ${potentialImages.length} potential images meeting criteria. ---`
	);
	return potentialImages;
}

// (Removed the extra logLoaded() call from the end)
// --- Message listener setup should happen implicitly by this script running ---
