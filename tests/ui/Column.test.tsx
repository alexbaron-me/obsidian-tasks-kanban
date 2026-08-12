// CardList (and transitively Card) call @dnd-kit hooks, which this project's vitest/jsdom setup
// cannot execute (a test-tooling limitation of dnd-kit + preact/compat under vitest's module
// resolution — the production esbuild bundle aliases correctly and is unaffected, see
// tests/ui/Card.test.tsx's header comment for the CardView split that works around this for
// Card itself). Column is now just a thin cell wrapper around CardList plus a quick-add button —
// column identity (label, count, WIP, rollups) moved to ColumnHeader, see that test file — so we
// stub CardList out here to test the cell shell in isolation.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { App, moment } from 'obsidian';
import { Column } from '../../src/ui/components/Column';
import { TaskWriter } from '../../src/write/TaskWriter';
import { FieldWriter } from '../../src/write/FieldWriter';
import { TasksApi } from '../../src/integration/TasksApi';
import { TasksCache } from '../../src/integration/TasksCache';
import { makeTask } from '../fixtures/tasks';
import type { RenderedColumn } from '../../src/board/renderPipeline';
import type { QueryContext } from '../../src/query/context';

vi.mock('../../src/ui/components/CardList', () => ({
	CardList: () => <div data-testid="card-list-stub" />,
}));

afterEach(cleanup);

function ctx(): QueryContext {
	return {
		file: { path: 'board.md', root: '/', folder: '', filename: 'board.md', filenameWithoutExtension: 'board', frontmatter: {} },
		allTasks: [],
		boardId: 'board.md',
		viewName: 'Test',
		today: moment(),
	};
}

function renderColumn(column: RenderedColumn | null, onQuickAdd = vi.fn()) {
	const app = new App();
	const taskWriter = new TaskWriter(app, new FieldWriter('emoji'), new TasksApi(app), new TasksCache(app));
	return render(
		<Column
			app={app}
			laneId="lane1"
			column={column}
			chips={[]}
			ctx={ctx()}
			accentRules={[]}
			clickAction="file"
			taskWriter={taskWriter}
			onToggleDone={() => {}}
			onEdit={() => {}}
			onOpenFile={() => {}}
			onQuickAdd={onQuickAdd}
		/>,
	);
}

describe('Column', () => {
	it('renders the card list for a populated bucket', () => {
		const column: RenderedColumn = { bucket: { id: 'Doing', label: 'Doing', writeValue: null, override: {} }, tasks: [makeTask()] };
		renderColumn(column);
		expect(screen.getByTestId('card-list-stub')).toBeTruthy();
	});

	it('clicking quick-add invokes the callback with this column', () => {
		const column: RenderedColumn = { bucket: { id: 'Doing', label: 'Doing', writeValue: null, override: {} }, tasks: [] };
		const onQuickAdd = vi.fn();
		renderColumn(column, onQuickAdd);
		fireEvent.click(screen.getByRole('button', { name: /add task/i }));
		expect(onQuickAdd).toHaveBeenCalledWith(column);
	});

	it('renders an empty placeholder cell when the lane has no bucket for this column', () => {
		const { container } = renderColumn(null);
		expect(container.querySelector('.tasks-board-cell--empty')).toBeTruthy();
		expect(screen.queryByTestId('card-list-stub')).toBeFalsy();
	});
});
