import { describe, expect, it } from 'vitest';
import { defaultSortRow, rowsToSortText, sortTextToRows } from '../../src/board/sortBuilder';

describe('rowsToSortText', () => {
	it('serialises a single sort row', () => {
		expect(rowsToSortText([{ field: 'due', reverse: false }])).toBe('sort by due');
	});
	it('serialises with reverse', () => {
		expect(rowsToSortText([{ field: 'urgency', reverse: true }])).toBe('sort by urgency reverse');
	});
	it('joins multiple sort keys with newlines', () => {
		expect(rowsToSortText([{ field: 'priority', reverse: false }, { field: 'description', reverse: false }])).toBe(
			'sort by priority\nsort by description',
		);
	});
	it('produces an empty string for no rows', () => {
		expect(rowsToSortText([])).toBe('');
	});
});

describe('sortTextToRows', () => {
	it('round-trips a multi-key sort', () => {
		const text = 'sort by priority\nsort by due reverse';
		const { rows, fullyRepresented } = sortTextToRows(text);
		expect(fullyRepresented).toBe(true);
		expect(rows).toEqual([
			{ field: 'priority', reverse: false },
			{ field: 'due', reverse: true },
		]);
		expect(rowsToSortText(rows)).toBe(text);
	});

	it('returns fullyRepresented=false for sort by function', () => {
		const { fullyRepresented } = sortTextToRows('sort by function task.description.length');
		expect(fullyRepresented).toBe(false);
	});

	it('returns fullyRepresented=false when a non-sort instruction is mixed in', () => {
		const { fullyRepresented } = sortTextToRows('sort by due\ndone');
		expect(fullyRepresented).toBe(false);
	});

	it('treats empty text as zero rows, fully representable', () => {
		expect(sortTextToRows('')).toEqual({ rows: [], fullyRepresented: true });
	});

	it('defaultSortRow is a sensible starting point', () => {
		expect(defaultSortRow()).toEqual({ field: 'due', reverse: false });
	});
});
