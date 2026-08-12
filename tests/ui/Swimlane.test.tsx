// See tests/ui/Column.test.tsx for why Column (and transitively Card) is stubbed here.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { App, moment } from 'obsidian';
import { Swimlane } from '../../src/ui/components/Swimlane';
import { TaskWriter } from '../../src/write/TaskWriter';
import { FieldWriter } from '../../src/write/FieldWriter';
import { TasksApi } from '../../src/integration/TasksApi';
import { TasksCache } from '../../src/integration/TasksCache';
import type { RenderedLane } from '../../src/board/renderPipeline';
import type { GridColumn } from '../../src/board/boardGrid';
import type { QueryContext } from '../../src/query/context';
import { makeTask } from '../fixtures/tasks';

vi.mock('../../src/ui/components/Column', () => ({
	Column: (props: { column: { bucket: { id: string } } | null }) => (
		<div data-testid={props.column ? `column-${props.column.bucket.id}` : 'column-empty'} />
	),
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

const oneColumn: GridColumn[] = [{ id: 'Doing', label: 'Doing' }];

function bucket(id: string) {
	return { id, label: id, writeValue: null, override: {} };
}

function renderSwimlane(overrides: Partial<Parameters<typeof Swimlane>[0]> & { lane: RenderedLane }) {
	const app = new App();
	const taskWriter = new TaskWriter(app, new FieldWriter('emoji'), new TasksApi(app), new TasksCache(app));
	return render(
		<Swimlane
			app={app}
			depth={0}
			kind="lane"
			showHeader={true}
			columns={oneColumn}
			chips={[]}
			ctx={ctx()}
			accentRules={[]}
			clickAction="file"
			taskWriter={taskWriter}
			collapseDefault={false}
			onToggleDone={() => {}}
			onEdit={() => {}}
			onOpenFile={() => {}}
			onQuickAdd={() => {}}
			{...overrides}
		/>,
	);
}

describe('Swimlane', () => {
	it('renders a header with the lane label and its task count', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High priority',
			columns: [{ bucket: bucket('Doing'), tasks: [makeTask()] }],
			children: null,
		};
		renderSwimlane({ lane });
		expect(screen.getByText('High priority')).toBeTruthy();
		expect(screen.getByRole('button', { name: /high priority, 1 task$/i })).toBeTruthy();
	});

	it('renders no header for the implicit lane of an ungrouped view', () => {
		const lane: RenderedLane = { id: '__all__', label: '', columns: [], children: null };
		const { container } = renderSwimlane({ lane, showHeader: false });
		expect(container.querySelector('.tasks-board-lane')).toBeFalsy();
	});

	it('renders one cell per shared column, matched by bucket id', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High',
			columns: [{ bucket: bucket('Doing'), tasks: [] }],
			children: null,
		};
		renderSwimlane({ lane, columns: [{ id: 'Doing', label: 'Doing' }, { id: 'Done', label: 'Done' }] });
		expect(screen.getByTestId('column-Doing')).toBeTruthy();
		// This lane has no bucket for "Done" — the track still gets a cell, an empty one.
		expect(screen.getByTestId('column-empty')).toBeTruthy();
	});

	it('collapsing swaps the cells for a per-column count summary', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High',
			columns: [{ bucket: bucket('Doing'), tasks: [makeTask(), makeTask()] }],
			children: null,
		};
		const { container } = renderSwimlane({ lane });
		expect(screen.getByTestId('column-Doing')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: /high, 2 tasks/i }));

		expect(screen.queryByTestId('column-Doing')).toBeFalsy();
		const summaries = container.querySelectorAll('.tasks-board-lane-summary');
		expect(summaries).toHaveLength(1);
		expect(summaries[0]!.textContent).toBe('2');
	});

	it('reports its collapsed state through aria-expanded', () => {
		const lane: RenderedLane = { id: 'high', label: 'High', columns: [], children: null };
		const { container } = renderSwimlane({ lane });
		const header = container.querySelector('.tasks-board-lane')!;
		expect(header.getAttribute('aria-expanded')).toBe('true');
		fireEvent.click(header);
		expect(header.getAttribute('aria-expanded')).toBe('false');
	});

	it('honours collapseDefault on first render', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High',
			columns: [{ bucket: bucket('Doing'), tasks: [] }],
			children: null,
		};
		renderSwimlane({ lane, collapseDefault: true });
		expect(screen.queryByTestId('column-Doing')).toBeFalsy();
	});

	it('renders a section row as a heading with no cells and no header', () => {
		const lane: RenderedLane = {
			id: 'alice',
			label: 'Alice',
			columns: [{ bucket: bucket('Doing'), tasks: [] }],
			children: [],
		};
		const { container } = renderSwimlane({ lane, kind: 'section' });
		expect(screen.getByText('Alice')).toBeTruthy();
		expect(container.querySelector('.tasks-board-section')).toBeTruthy();
		expect(screen.queryByTestId('column-Doing')).toBeFalsy();
		expect(container.querySelector('.tasks-board-lane')).toBeFalsy();
	});

	it('shows a colour marker on a top-level lane but not on a nested one', () => {
		const lane: RenderedLane = { id: 'high', label: 'High', columns: [], children: null };
		const top = renderSwimlane({ lane });
		expect(top.container.querySelector('.tasks-board-lane__dot')).toBeTruthy();
		cleanup();

		const nested = renderSwimlane({ lane, depth: 1 });
		expect(nested.container.querySelector('.tasks-board-lane__dot')).toBeFalsy();
	});

	it('falls back to "(none)" for an empty lane label', () => {
		const lane: RenderedLane = { id: '(none)', label: '', columns: [], children: null };
		renderSwimlane({ lane });
		expect(screen.getByText('(none)')).toBeTruthy();
	});
});
