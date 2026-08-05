import { describe, expect, it } from 'vitest';
import { applyOrder, pruneOrder, recordOrder } from '../../src/board/order';
import { makeTask } from '../fixtures/tasks';

describe('applyOrder', () => {
	it('moves a card before its anchor', () => {
		const a = makeTask({ id: 'aaa', description: 'A' });
		const b = makeTask({ id: 'bbb', description: 'B' });
		const c = makeTask({ id: 'ccc', description: 'C' });
		const result = applyOrder([a, b, c], [{ id: 'ccc', before: 'aaa' }]);
		expect(result.map((t) => t.id)).toEqual(['ccc', 'aaa', 'bbb']);
	});

	it('moves a card after its anchor', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const c = makeTask({ id: 'ccc' });
		const result = applyOrder([a, b, c], [{ id: 'aaa', after: 'ccc' }]);
		expect(result.map((t) => t.id)).toEqual(['bbb', 'ccc', 'aaa']);
	});

	it('moves a card to first', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const result = applyOrder([a, b], [{ id: 'bbb', first: true }]);
		expect(result.map((t) => t.id)).toEqual(['bbb', 'aaa']);
	});

	it('moves a card to last', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const result = applyOrder([a, b], [{ id: 'aaa', last: true }]);
		expect(result.map((t) => t.id)).toEqual(['bbb', 'aaa']);
	});

	it('drops an override whose card is absent from the bucket', () => {
		const a = makeTask({ id: 'aaa' });
		const result = applyOrder([a], [{ id: 'zzz', first: true }]);
		expect(result.map((t) => t.id)).toEqual(['aaa']);
	});

	it('drops an override whose anchor is absent', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const result = applyOrder([a, b], [{ id: 'aaa', before: 'missing' }]);
		expect(result.map((t) => t.id)).toEqual(['aaa', 'bbb']);
	});

	it('applies multiple overrides in file order', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const c = makeTask({ id: 'ccc' });
		const result = applyOrder([a, b, c], [
			{ id: 'ccc', first: true },
			{ id: 'bbb', after: 'ccc' },
		]);
		expect(result.map((t) => t.id)).toEqual(['ccc', 'bbb', 'aaa']);
	});

	it('a completed anchor moves the card by one slot rather than scrambling the column (documented limitation)', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const c = makeTask({ id: 'ccc' });
		// "aaa" is ordered before "bbb". If "bbb" then completes and drops out of the bucket
		// (e.g. filtered out), re-applying the same override against the smaller list still
		// yields a stable, sensible order rather than an error.
		const result = applyOrder([a, c], [{ id: 'aaa', before: 'bbb' }]);
		expect(result.map((t) => t.id)).toEqual(['aaa', 'ccc']);
	});
});

describe('pruneOrder', () => {
	it('drops an override whose card id no longer exists', () => {
		const result = pruneOrder([{ id: 'aaa', first: true }], new Set(['bbb']));
		expect(result).toEqual([]);
	});

	it('drops an override whose anchor no longer exists', () => {
		const result = pruneOrder([{ id: 'aaa', before: 'bbb' }], new Set(['aaa']));
		expect(result).toEqual([]);
	});

	it('keeps a valid override', () => {
		const ov = { id: 'aaa', before: 'bbb' } as const;
		const result = pruneOrder([ov], new Set(['aaa', 'bbb']));
		expect(result).toEqual([ov]);
	});

	it('keeps first/last overrides as long as the card id is valid', () => {
		const ov = { id: 'aaa', last: true } as const;
		expect(pruneOrder([ov], new Set(['aaa']))).toEqual([ov]);
	});
});

describe('recordOrder', () => {
	it('prefers before the next card', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const c = makeTask({ id: 'ccc' });
		// dragged card "bbb" landed at index 1, between "aaa" and "ccc"
		expect(recordOrder([a, b, c], 1)).toEqual({ id: 'bbb', before: 'ccc' });
	});

	it('falls back to after the previous card when dropped at the end', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		expect(recordOrder([a, b], 1)).toEqual({ id: 'bbb', after: 'aaa' });
	});

	it('falls back to last for a single-card bucket', () => {
		const a = makeTask({ id: 'aaa' });
		expect(recordOrder([a], 0)).toEqual({ id: 'aaa', last: true });
	});

	it('walks forward past id-less neighbours to find an anchor', () => {
		const a = makeTask({ id: 'aaa' });
		const noId1 = makeTask({ id: '' });
		const noId2 = makeTask({ id: '' });
		const c = makeTask({ id: 'ccc' });
		expect(recordOrder([a, noId1, noId2, c], 0)).toEqual({ id: 'aaa', before: 'ccc' });
	});
});
