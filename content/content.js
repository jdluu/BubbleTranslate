console.log("BubbleTranslate: Content Script Loaded!"); // Log when injected

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("BubbleTranslate: Message received in content script.");
	// console.log("Sender:", sender); // Background script doesn't have a tab context here
	console.log("Request:", request);

	if (request.action === "triggerPageAnalysis") {
		console.log("BubbleTranslate: 'triggerPageAnalysis' action received.");

		// --- MVP: Find images and send their URLs back to background ---
		const images = findPotentialMangaImages();
		console.log(`BubbleTranslate: Found ${images.length} potential images.`);

		images.forEach((img) => {
			// Send each image URL to the background script for OCR/Translation
			console.log(
				`BubbleTranslate: Sending image URL to background: ${img.src}`
			);
			chrome.runtime.sendMessage({ action: "processImage", imageUrl: img.src });
			// NOTE: We are not waiting for a response from the background for each image in this simple MVP
		});
		// ----------------------------------------------------------------

		// Send a response back to the background script immediately
		// confirming we started processing.
		sendResponse({ status: "processingImages", foundCount: images.length });

		// Return true if you might use sendResponse asynchronously later.
		// Since we find images and send messages synchronously here, it's not strictly required.
		// return true;
	} else {
		console.log(
			"BubbleTranslate Content Script: Received unknown action:",
			request.action
		);
	}
});

/**
 * Finds potential manga/comic images on the page.
 * MVP Implementation: Finds all <img> tags larger than a certain size.
 * @returns {HTMLImageElement[]} An array of image elements.
 */
function findPotentialMangaImages() {
	console.log("BubbleTranslate: Searching for potential images...");
	const allImages = document.querySelectorAll("img");
	const potentialImages = [];
	const minWidth = 300; // Adjust minimum width as needed
	const minHeight = 400; // Adjust minimum height as needed

	allImages.forEach((img) => {
		// Check naturalWidth/Height if available (better for scaled images),
		// otherwise fallback to offsetWidth/Height or width/height attributes.
		const width = img.naturalWidth || img.offsetWidth || img.width;
		const height = img.naturalHeight || img.offsetHeight || img.height;

		if (width >= minWidth && height >= minHeight) {
			// Basic filtering logic (can be improved later)
			// Ensure src is not empty and potentially check format if needed
			if (img.src && img.src.startsWith("http")) {
				// Avoid data URIs initially? or allow?
				potentialImages.push(img);
			}
		}
	});
	return potentialImages;
}

console.log("BubbleTranslate: Content Script listener added.");
