/**
 * Cosmetic-only stripping of the Tasks global filter tag from what a card renders. The
 * underlying file text is never touched — see `GlobalSettings.hideGlobalFilterTag`.
 */
export function stripGlobalFilterTag(text: string, tag: string): string {
	if (!tag) return text;
	const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'g');
	return text.replace(re, '$1').replace(/\s{2,}/g, ' ').trim();
}
