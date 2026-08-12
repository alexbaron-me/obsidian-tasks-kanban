import { describe, expect, it } from 'vitest';
import { applyOrder, computeDropPosition, pruneOrder, recordOrder } from '../../src/board/order';
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

describe('computeDropPosition', () => {
	it('is a no-op when a card is dropped back at the end of the same bucket, already last', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const result = computeDropPosition([a, b], b, null, true);
		expect(result.isNoOp).toBe(true);
		expect(result.newOrder).toEqual([a, b]);
	});

	it('is a no-op when dropped back immediately before the same next card', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const c = makeTask({ id: 'ccc' });
		const result = computeDropPosition([a, b, c], a, b, true);
		expect(result.isNoOp).toBe(true);
	});

	it('is not a no-op for a genuine within-bucket reorder', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const c = makeTask({ id: 'ccc' });
		const result = computeDropPosition([a, b, c], c, a, true);
		expect(result.isNoOp).toBe(false);
		expect(result.newOrder).toEqual([c, a, b]);
		expect(result.insertAt).toBe(0);
	});

	it('is never a no-op when the drop crosses buckets, even at the same visual position', () => {
		const a = makeTask({ id: 'aaa' });
		const result = computeDropPosition([a], a, null, false);
		expect(result.isNoOp).toBe(false);
	});

	it('computes the correct insertAt and newOrder for a drop at the end', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const result = computeDropPosition([a], b, null, false);
		expect(result.newOrder).toEqual([a, b]);
		expect(result.insertAt).toBe(1);
	});

	it('falls back to inserting at the end when insertBeforeTask is not found in the bucket', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const ghost = makeTask({ id: 'ghost' });
		const result = computeDropPosition([a], b, ghost, false);
		expect(result.newOrder).toEqual([a, b]);
		expect(result.insertAt).toBe(1);
	});

	it('is a no-op when the drop lands on the dragged card\'s own "insert before" zone, mid-bucket', () => {
		// Every card is also a droppable "insert before me" zone, including the one being
		// dragged. A short drag that never clears its own bounds resolves `event.over` to that
		// zone, i.e. insertBeforeTask === task itself — this must not be misread as "move to the
		// end" (regression: a short/no-op drag on a card that isn't already last was still
		// triggering the manual-order confirmation).
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const c = makeTask({ id: 'ccc' });
		const result = computeDropPosition([a, b, c], b, b, true);
		expect(result.isNoOp).toBe(true);
		expect(result.newOrder).toEqual([a, b, c]);
		expect(result.insertAt).toBe(1);
	});

	it('is a no-op when the drop lands on the first card\'s own zone', () => {
		const a = makeTask({ id: 'aaa' });
		const b = makeTask({ id: 'bbb' });
		const result = computeDropPosition([a, b], a, a, true);
		expect(result.isNoOp).toBe(true);
		expect(result.insertAt).toBe(0);
	});
});
