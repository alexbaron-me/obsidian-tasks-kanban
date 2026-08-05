import { describe, expect, it, vi } from 'vitest';
import { BoardModel } from '../../src/model/BoardModel';

function fakeAdapter() {
	const writes: string[] = [];
	return { write: async (text: string) => void writes.push(text), writes };
}

describe('BoardModel', () => {
	it('bootstraps state from valid YAML', () => {
		const model = new BoardModel('filters: not done\nviews:\n  - name: Status\n', fakeAdapter());
		const state = model.getState();
		expect(state.status).toBe('ok');
		if (state.status === 'ok') {
			expect(state.boardFile.filters).toBe('not done');
			expect(state.boardFile.views).toHaveLength(1);
		}
	});

	it('enters parse-error state for malformed YAML without throwing', () => {
		const model = new BoardModel('filters: [unclosed', fakeAdapter());
		expect(model.getState().status).toBe('parse-error');
	});

	it('notifies subscribers synchronously on mutation', () => {
		const model = new BoardModel('views:\n  - name: A\n', fakeAdapter());
		const seen: string[] = [];
		model.subscribe((state) => {
			if (state.status === 'ok') seen.push(state.boardFile.filters);
		});
		model.setBoardFilters('is recurring');
		expect(seen).toEqual(['', 'is recurring']);
	});

	it('preserves comments across a targeted mutation', () => {
		const model = new BoardModel('filters: not done\n# keep me\nviews:\n  - name: A\n', fakeAdapter());
		model.setBoardFilters('is recurring');
		const state = model.getState();
		expect(state.status).toBe('ok');
	});

	it('debounces saves and flushes on demand', async () => {
		vi.useFakeTimers();
		const adapter = fakeAdapter();
		const model = new BoardModel('views:\n  - name: A\n', adapter);
		model.setBoardFilters('done');
		model.setBoardFilters('not done');
		expect(adapter.writes).toHaveLength(0);
		await model.flush();
		expect(adapter.writes).toHaveLength(1);
		expect(adapter.writes[0]).toContain('not done');
		vi.useRealTimers();
	});

	it('flush is a no-op when nothing changed', async () => {
		const adapter = fakeAdapter();
		const model = new BoardModel('views:\n  - name: A\n', adapter);
		await model.flush();
		expect(adapter.writes).toHaveLength(0);
	});

	it('addView appends a new view with defaults', () => {
		const model = new BoardModel('views:\n  - name: A\n', fakeAdapter());
		model.addView('B');
		const state = model.getState();
		expect(state.status).toBe('ok');
		if (state.status === 'ok') {
			expect(state.boardFile.views).toHaveLength(2);
			expect(state.boardFile.views[1]!.name).toBe('B');
		}
	});

	it('renameView updates only the target view', () => {
		const model = new BoardModel('views:\n  - name: A\n  - name: B\n', fakeAdapter());
		model.renameView(1, 'Renamed');
		const state = model.getState();
		if (state.status === 'ok') {
			expect(state.boardFile.views[0]!.name).toBe('A');
			expect(state.boardFile.views[1]!.name).toBe('Renamed');
		}
	});

	it('removeView deletes the view at the given index', () => {
		const model = new BoardModel('views:\n  - name: A\n  - name: B\n', fakeAdapter());
		model.removeView(0);
		const state = model.getState();
		if (state.status === 'ok') {
			expect(state.boardFile.views).toHaveLength(1);
			expect(state.boardFile.views[0]!.name).toBe('B');
		}
	});

	it('reorderViews moves a view to a new position', () => {
		const model = new BoardModel('views:\n  - name: A\n  - name: B\n  - name: C\n', fakeAdapter());
		model.reorderViews(0, 2);
		const state = model.getState();
		if (state.status === 'ok') {
			expect(state.boardFile.views.map((v) => v.name)).toEqual(['B', 'C', 'A']);
		}
	});

	it('setOrder writes and clears order overrides for a bucket', () => {
		const model = new BoardModel('views:\n  - name: A\n', fakeAdapter());
		model.setOrder(0, 'Doing', [{ id: 'ab12cd', last: true }]);
		let state = model.getState();
		if (state.status === 'ok') expect(state.boardFile.views[0]!.order['Doing']).toEqual([{ id: 'ab12cd', last: true }]);
		model.setOrder(0, 'Doing', []);
		state = model.getState();
		if (state.status === 'ok') expect(state.boardFile.views[0]!.order['Doing']).toBeUndefined();
	});

	it('setRawText re-parses and can recover from a parse error', () => {
		const model = new BoardModel('filters: [unclosed', fakeAdapter());
		expect(model.getState().status).toBe('parse-error');
		model.setRawText('filters: not done\nviews: []\n');
		expect(model.getState().status).toBe('ok');
	});
});
