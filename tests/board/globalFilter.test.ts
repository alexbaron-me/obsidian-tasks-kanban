import { describe, expect, it } from 'vitest';
import { stripGlobalFilterTag } from '../../src/board/globalFilter';

describe('stripGlobalFilterTag', () => {
	it('returns the text unchanged when there is no tag configured', () => {
		expect(stripGlobalFilterTag('Buy milk #task', '')).toBe('Buy milk #task');
	});

	it('strips a trailing tag', () => {
		expect(stripGlobalFilterTag('Buy milk #task', '#task')).toBe('Buy milk');
	});

	it('strips a leading tag', () => {
		expect(stripGlobalFilterTag('#task Buy milk', '#task')).toBe('Buy milk');
	});

	it('strips a tag in the middle without leaving a double space', () => {
		expect(stripGlobalFilterTag('Buy #task milk', '#task')).toBe('Buy milk');
	});

	it('leaves the text unchanged when the tag is not present', () => {
		expect(stripGlobalFilterTag('Buy milk #groceries', '#task')).toBe('Buy milk #groceries');
	});

	it('does not strip a tag that is only a prefix of a longer tag', () => {
		expect(stripGlobalFilterTag('Buy milk #task/urgent', '#task')).toBe('Buy milk #task/urgent');
	});

	it('escapes regex-special characters in the tag', () => {
		expect(stripGlobalFilterTag('Buy milk [task]', '[task]')).toBe('Buy milk');
	});

	it('handles the whole description being just the tag', () => {
		expect(stripGlobalFilterTag('#task', '#task')).toBe('');
	});
});
