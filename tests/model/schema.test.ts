import { describe, expect, it } from 'vitest';
import { bootstrapBoardFile, parseBoardYaml, serializeBoardFile, validateBoardFile } from '../../src/model/schema';

describe('validateBoardFile', () => {
	it('applies defaults for a minimal document', () => {
		const { doc, errors } = validateBoardFile({});
		expect(errors).toEqual([]);
		expect(doc).toEqual({ version: 1, filters: '', settings: {}, views: [] });
	});

	it('parses a full document', () => {
		const raw = {
			filters: 'not done',
			settings: { hideDoneAfterDays: 7, density: 'compact' },
			views: [
				{
					name: 'Board',
					filters: 'priority is high',
					sort: 'sort by due',
					settings: { clickAction: 'modal' },
					columns: {
						field: 'status',
						buckets: [{ name: 'Doing', match: [' '] }],
						overrides: { Doing: { wip: { max: 3, mode: 'hard' } } },
					},
					lanes: { groupBy: 'group by priority', nested: undefined },
					card: { chips: ['due', 'tags'] },
					order: { Doing: [{ id: 'ab12cd', before: 'ef34gh' }] },
				},
			],
		};
		const { doc, errors } = validateBoardFile(raw);
		expect(errors).toEqual([]);
		expect(doc.filters).toBe('not done');
		expect(doc.settings.hideDoneAfterDays).toBe(7);
		expect(doc.views).toHaveLength(1);
		expect(doc.views[0]!.columns.generator).toBe('explicit');
		expect(doc.views[0]!.columns.overrides['Doing']?.wip).toEqual({ max: 3, mode: 'hard' });
		expect(doc.views[0]!.order['Doing']).toEqual([{ id: 'ab12cd', before: 'ef34gh' }]);
	});

	it('records a warning and keeps the file rendering when a view is malformed', () => {
		const { doc, errors } = validateBoardFile({ views: [null, { name: 'Ok' }] });
		expect(doc.views).toHaveLength(2);
		expect(errors.some((e) => e.path === 'views[0]')).toBe(true);
	});

	it('infers the explicit generator when buckets are present', () => {
		const { doc } = validateBoardFile({
			views: [{ columns: { field: 'status', buckets: [{ name: 'A', match: ['x'] }] } }],
		});
		expect(doc.views[0]!.columns.generator).toBe('explicit');
	});

	it('infers the rolling generator when span is present', () => {
		const { doc } = validateBoardFile({
			views: [{ columns: { field: 'due', span: { from: 0, to: 3 } } }],
		});
		expect(doc.views[0]!.columns.generator).toBe('rolling');
	});

	it('infers auto when neither buckets nor span are present', () => {
		const { doc } = validateBoardFile({ views: [{ columns: { field: 'tags' } }] });
		expect(doc.views[0]!.columns.generator).toBe('auto');
	});

	it('warns and prefers explicit when both buckets and span are present without an explicit generator', () => {
		const { doc, errors } = validateBoardFile({
			views: [{ columns: { field: 'due', buckets: [{ name: 'A', match: ['x'] }], span: { from: 0, to: 1 } } }],
		});
		expect(doc.views[0]!.columns.generator).toBe('explicit');
		expect(errors.some((e) => e.message.includes('explicit generator wins'))).toBe(true);
	});

	it('coerces an invalid setting to the default and records an error', () => {
		const { doc, errors } = validateBoardFile({ settings: { density: 'huge' } });
		expect(doc.settings.density).toBeUndefined();
		expect(errors.some((e) => e.path === 'settings.density')).toBe(true);
	});
});

describe('YAML round-trip', () => {
	it('parses and preserves comments and key order untouched by mutation', () => {
		const text = 'filters: not done\n# a helpful comment\nviews:\n  - name: Status\n    filters: ""\n';
		const result = parseBoardYaml(text);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		result.document.setIn(['filters'], 'is recurring');
		const out = result.document.toString();
		expect(out).toContain('# a helpful comment');
		expect(out).toContain('is recurring');
	});

	it('reports a parse error for malformed YAML without throwing', () => {
		const result = parseBoardYaml('filters: [unclosed');
		expect(result.ok).toBe(false);
	});

	it('serializes a fresh BoardFile to valid YAML that reparses to the same document', () => {
		const board = bootstrapBoardFile([
			{ symbol: ' ', name: 'Todo', type: 'TODO' },
			{ symbol: 'x', name: 'Done', type: 'DONE' },
		]);
		const text = serializeBoardFile(board);
		const reparsed = parseBoardYaml(text);
		expect(reparsed.ok).toBe(true);
		if (reparsed.ok) {
			expect(reparsed.boardFile.views[0]!.columns.buckets).toHaveLength(2);
		}
	});
});

describe('bootstrapBoardFile', () => {
	it('groups statuses by type into one bucket per type', () => {
		const board = bootstrapBoardFile([
			{ symbol: ' ', name: 'Todo', type: 'TODO' },
			{ symbol: '/', name: 'Doing', type: 'IN_PROGRESS' },
			{ symbol: 'x', name: 'Done', type: 'DONE' },
			{ symbol: '-', name: 'Cancelled', type: 'CANCELLED' },
		]);
		const buckets = board.views[0]!.columns.buckets!;
		expect(buckets).toHaveLength(4);
		expect(board.views[0]!.filters).toBe('');
		// No board-level filter, so the Done/Cancelled buckets aren't self-defeated (see comment
		// in bootstrapBoardFile).
		expect(board.filters).toBe('');
		expect(board.views[0]!.card.chips).toEqual(['due', 'priority', 'tags']);
		expect(board.views[0]!.lanes).toBeNull();
	});
});
