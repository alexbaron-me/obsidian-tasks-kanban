// See tests/ui/Column.test.tsx for why Column (and transitively Card) is stubbed here.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { App, moment } from 'obsidian';
import { Lane } from '../../src/ui/components/Lane';
import { TaskWriter } from '../../src/write/TaskWriter';
import { FieldWriter } from '../../src/write/FieldWriter';
import { TasksApi } from '../../src/integration/TasksApi';
import { TasksCache } from '../../src/integration/TasksCache';
import type { RenderedLane } from '../../src/board/renderPipeline';
import type { CanonicalColumn } from '../../src/board/laneGrid';
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

const oneColumn: CanonicalColumn[] = [{ id: 'Doing', label: 'Doing' }];

function renderLane(overrides: Partial<Parameters<typeof Lane>[0]> & { lane: RenderedLane }) {
	const app = new App();
	const taskWriter = new TaskWriter(app, new FieldWriter('emoji'), new TasksApi(app), new TasksCache(app));
	return render(
		<Lane
			app={app}
			depth={0}
			isGroupHeading={false}
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

describe('Lane', () => {
	it('renders a header bar with the label and issue count for a named lane', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High priority',
			columns: [{ bucket: { id: 'Doing', label: 'Doing', writeValue: null, override: {} }, tasks: [makeTask()] }],
			nested: null,
		};
		renderLane({ lane });
		expect(screen.getByText('High priority')).toBeTruthy();
		expect(screen.getByText('1 issue')).toBeTruthy();
	});

	it('renders no header bar when showHeader is false (the ungrouped lane)', () => {
		const lane: RenderedLane = { id: '__all__', label: '', columns: [], nested: null };
		const { container } = renderLane({ lane, showHeader: false });
		expect(container.querySelector('.tasks-board-grid__lane-header')).toBeFalsy();
	});

	it('renders one stubbed Column per canonical column, matched by bucket id', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High',
			columns: [{ bucket: { id: 'Doing', label: 'Doing', writeValue: null, override: {} }, tasks: [] }],
			nested: null,
		};
		renderLane({ lane, columns: [{ id: 'Doing', label: 'Doing' }, { id: 'Done', label: 'Done' }] });
		expect(screen.getByTestId('column-Doing')).toBeTruthy();
		// The lane has no bucket for "Done" — Column still renders, as an empty-slot cell.
		expect(screen.getByTestId('column-empty')).toBeTruthy();
	});

	it('collapsing the lane hides its cells', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High',
			columns: [{ bucket: { id: 'Doing', label: 'Doing', writeValue: null, override: {} }, tasks: [] }],
			nested: null,
		};
		renderLane({ lane });
		expect(screen.getByTestId('column-Doing')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /collapse lane/i }));
		expect(screen.queryByTestId('column-Doing')).toBeFalsy();
	});

	it('honours collapseDefault on first render', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High',
			columns: [{ bucket: { id: 'Doing', label: 'Doing', writeValue: null, override: {} }, tasks: [] }],
			nested: null,
		};
		renderLane({ lane, collapseDefault: true });
		expect(screen.queryByTestId('column-Doing')).toBeFalsy();
	});

	it('renders a plain section heading with no cells for a group-heading row', () => {
		const lane: RenderedLane = {
			id: 'alice',
			label: 'Alice',
			columns: [{ bucket: { id: 'Doing', label: 'Doing', writeValue: null, override: {} }, tasks: [] }],
			nested: [],
		};
		const { container } = renderLane({ lane, isGroupHeading: true });
		expect(screen.getByText('Alice')).toBeTruthy();
		expect(container.querySelector('.tasks-board-grid__group-heading')).toBeTruthy();
		expect(screen.queryByTestId('column-Doing')).toBeFalsy();
		expect(container.querySelector('.tasks-board-grid__lane-header')).toBeFalsy();
	});
});
