import { describe, expect, it } from 'vitest';
import { defaultRow, rowToText, rowsToText, textToRows } from '../../src/board/filterBuilder';

describe('rowToText', () => {
	it('serialises a done row', () => {
		expect(rowToText({ ...defaultRow(), kind: 'done', negate: false })).toBe('done');
		expect(rowToText({ ...defaultRow(), kind: 'done', negate: true })).toBe('not done');
	});
	it('serialises a status type row', () => {
		expect(rowToText({ ...defaultRow(), kind: 'statusType', statusType: 'IN_PROGRESS' })).toBe('status.type is IN_PROGRESS');
	});
	it('serialises a date compare row', () => {
		expect(rowToText({ ...defaultRow(), kind: 'date', dateField: 'due', dateOp: 'on-or-before', dateValue: 'today' })).toBe(
			'due on or before today',
		);
	});
	it('serialises a date range row', () => {
		expect(
			rowToText({ ...defaultRow(), kind: 'dateRange', dateField: 'due', dateRangeFrom: 'today', dateRangeTo: 'in 5 days' }),
		).toBe('due in today in 5 days');
	});
	it('serialises a has-date row', () => {
		expect(rowToText({ ...defaultRow(), kind: 'hasDate', hasDateField: 'scheduled', has: true })).toBe('has scheduled date');
		expect(rowToText({ ...defaultRow(), kind: 'hasDate', hasDateField: 'scheduled', has: false })).toBe('no scheduled date');
	});
	it('serialises a priority row with and without a modifier', () => {
		expect(rowToText({ ...defaultRow(), kind: 'priority', priorityMod: null, priorityValue: 'high' })).toBe('priority is high');
		expect(rowToText({ ...defaultRow(), kind: 'priority', priorityMod: 'above', priorityValue: 'medium' })).toBe(
			'priority is above medium',
		);
	});
	it('serialises a text row', () => {
		expect(rowToText({ ...defaultRow(), kind: 'text', textField: 'path', textIncludes: false, textValue: 'Archive' })).toBe(
			'path does not include Archive',
		);
	});
	it('serialises a tag row', () => {
		expect(rowToText({ ...defaultRow(), kind: 'tag', tagIncludes: true, tagValue: '#work' })).toBe('tag includes #work');
	});
	it('serialises recurring/blocked/blocking rows', () => {
		expect(rowToText({ ...defaultRow(), kind: 'recurring', negate: false })).toBe('is recurring');
		expect(rowToText({ ...defaultRow(), kind: 'blocked', negate: true })).toBe('is not blocked');
		expect(rowToText({ ...defaultRow(), kind: 'blocking', negate: false })).toBe('is blocking');
	});
});

describe('rowsToText', () => {
	it('joins multiple rows with newlines (implicit AND)', () => {
		const rows = [
			{ ...defaultRow(), kind: 'done' as const, negate: true },
			{ ...defaultRow(), kind: 'priority' as const, priorityMod: null, priorityValue: 'high' as const },
		];
		expect(rowsToText(rows)).toBe('not done\npriority is high');
	});
	it('produces an empty string for no rows', () => {
		expect(rowsToText([])).toBe('');
	});
});

describe('textToRows', () => {
	it('round-trips a simple AND-only filter', () => {
		const text = 'not done\npriority is high\ntag includes #work';
		const { rows, fullyRepresented } = textToRows(text);
		expect(fullyRepresented).toBe(true);
		expect(rows).toHaveLength(3);
		expect(rowsToText(rows)).toBe(text);
	});

	it('returns fullyRepresented=false for boolean composition', () => {
		const { fullyRepresented } = textToRows('(done) AND (priority is high)');
		expect(fullyRepresented).toBe(false);
	});

	it('returns fullyRepresented=false for filter by function', () => {
		const { fullyRepresented } = textToRows('filter by function task.description.length > 5');
		expect(fullyRepresented).toBe(false);
	});

	it('returns fullyRepresented=false for a parse error', () => {
		const { fullyRepresented } = textToRows('this is nonsense');
		expect(fullyRepresented).toBe(false);
	});

	it('treats empty text as zero rows, fully representable', () => {
		expect(textToRows('')).toEqual({ rows: [], fullyRepresented: true });
		expect(textToRows('   ')).toEqual({ rows: [], fullyRepresented: true });
	});

	it('round-trips every supported row kind', () => {
		const text = [
			'done',
			'status.type is TODO',
			'status.name includes Waiting',
			'due before today',
			'due in today tomorrow',
			'has due date',
			'priority is high',
			'description includes foo',
			'description regex matches /^Fix/i',
			'tag includes #work',
			'is recurring',
			'is blocked',
			'is blocking',
		].join('\n');
		const { rows, fullyRepresented } = textToRows(text);
		expect(fullyRepresented).toBe(true);
		expect(rows).toHaveLength(13);
		expect(rowsToText(rows)).toBe(text);
	});
});
