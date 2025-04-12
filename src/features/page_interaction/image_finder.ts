// src/features/page_interaction/image_finder.ts
import { MIN_IMG_WIDTH, MIN_IMG_HEIGHT } from "@shared/constants";

/**
 * Finds potential manga/comic images on the page based on minimum dimensions.
 * @returns An array of image elements meeting the criteria.
 */
export function findPotentialMangaImages(): HTMLImageElement[] {
	// querySelectorAll returns NodeListOf<Element>, needs casting for HTMLImageElement specifics
	const allImages = document.querySelectorAll<HTMLImageElement>("img");
	const potentialImages: HTMLImageElement[] = [];

	allImages.forEach((img) => {
		// Use naturalWidth/Height if available (more accurate), fallback to offsetWidth/Height
		const width = img.naturalWidth || img.offsetWidth;
		const height = img.naturalHeight || img.offsetHeight;

		if (width >= MIN_IMG_WIDTH && height >= MIN_IMG_HEIGHT) {
			// Additional checks (e.g., visibility, valid src) could be added here
			if (
				img.src &&
				(img.src.startsWith("http") || img.src.startsWith("data:"))
			) {
				potentialImages.push(img);
			}
		}
	});

	return potentialImages;
}
