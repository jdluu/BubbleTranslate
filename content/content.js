/**
 * Finds potential manga/comic images on the page.
 * MVP Implementation: Finds all <img> tags larger than a certain size.
 * @returns {HTMLImageElement[]} An array of image elements.
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
		// Try to get dimensions. naturalWidth/Height are best if available.
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

		// Log dimensions for *every* image for debugging
		console.log(
			`BubbleTranslate: Image[${index}] | Width: ${width}, Height: ${height} | Src: ${img.src.substring(
				0,
				100
			)}...`
		); // Log dimensions and partial src

		// Apply the filter
		if (width >= minWidth && height >= minHeight) {
			// Optionally add more checks (e.g., ignore tiny placeholders)
			if (
				img.src &&
				(img.src.startsWith("http") || img.src.startsWith("data:"))
			) {
				// Allow http(s) and data URIs
				console.log(
					`%cBubbleTranslate: ---> Image[${index}] MET criteria! Adding.`,
					"color: green; font-weight: bold;"
				); // Highlight matches
				potentialImages.push(img);
			} else {
				console.log(
					`BubbleTranslate: ---> Image[${index}] dimensions OK, but src invalid/missing.`
				);
			}
		} else {
			// Optional log for rejected images (can be noisy)
			// console.log(`BubbleTranslate: ---> Image[${index}] rejected (dimensions too small).`);
		}
	});

	console.log(
		`BubbleTranslate: --- Finished Image Search. Found ${potentialImages.length} potential images meeting criteria. ---`
	);
	return potentialImages;
}
