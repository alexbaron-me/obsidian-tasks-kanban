// See tests/ui/Column.test.tsx for why Column (and transitively Card) is stubbed here.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { App } from 'obsidian';
import moment from 'moment';

vi.mock('../../src/ui/components/Column', () => ({
	Column: (props: { column: { bucket: { id: string } } }) => <div data-testid={`column-${props.column.bucket.id}`} />,
}));

// eslint-disable-next-line import/first
import { Lane } from '../../src/ui/components/Lane';
// eslint-disable-next-line import/first
import { TaskWriter } from '../../src/write/TaskWriter';
// eslint-disable-next-line import/first
import { FieldWriter } from '../../src/write/FieldWriter';
// eslint-disable-next-line import/first
import { TasksApi } from '../../src/integration/TasksApi';
// eslint-disable-next-line import/first
import { TasksCache } from '../../src/integration/TasksCache';
// eslint-disable-next-line import/first
import type { RenderedLane } from '../../src/board/renderPipeline';
// eslint-disable-next-line import/first
import type { QueryContext } from '../../src/query/context';

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

function renderLane(lane: RenderedLane, collapseDefault = false) {
	const app = new App();
	const taskWriter = new TaskWriter(app, new FieldWriter('emoji'), new TasksApi(app), new TasksCache(app));
	return render(
		<Lane
			app={app}
			lane={lane}
			chips={[]}
			ctx={ctx()}
			accentRules={[]}
			clickAction="file"
			taskWriter={taskWriter}
			collapseDefault={collapseDefault}
			onToggleDone={() => {}}
			onEdit={() => {}}
			onOpenFile={() => {}}
			onQuickAdd={() => {}}
		/>,
	);
}

describe('Lane', () => {
	it('renders a header and label for a named lane', () => {
		const lane: RenderedLane = { id: 'high', label: 'High priority', columns: [], nested: null };
		renderLane(lane);
		expect(screen.getByText('High priority')).toBeTruthy();
	});

	it('renders no header for the ungrouped lane', () => {
		const lane: RenderedLane = { id: '__all__', label: '', columns: [], nested: null };
		const { container } = renderLane(lane);
		expect(container.querySelector('.tasks-board-lane__header')).toBeFalsy();
	});

	it('renders one stubbed Column per bucket', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High',
			columns: [
				{ bucket: { id: 'Doing', label: 'Doing', writeValue: null, override: {} }, tasks: [] },
				{ bucket: { id: 'Done', label: 'Done', writeValue: null, override: {} }, tasks: [] },
			],
			nested: null,
		};
		renderLane(lane);
		expect(screen.getByTestId('column-Doing')).toBeTruthy();
		expect(screen.getByTestId('column-Done')).toBeTruthy();
	});

	it('collapsing the lane hides its columns', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High',
			columns: [{ bucket: { id: 'Doing', label: 'Doing', writeValue: null, override: {} }, tasks: [] }],
			nested: null,
		};
		renderLane(lane);
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
		renderLane(lane, true);
		expect(screen.queryByTestId('column-Doing')).toBeFalsy();
	});

	it('renders nested lanes recursively', () => {
		const lane: RenderedLane = {
			id: 'high',
			label: 'High',
			columns: [],
			nested: [
				{ id: 'work', label: 'Work', columns: [{ bucket: { id: 'Doing', label: 'Doing', writeValue: null, override: {} }, tasks: [] }], nested: null },
			],
		};
		renderLane(lane);
		expect(screen.getByText('Work')).toBeTruthy();
		expect(screen.getByTestId('column-Doing')).toBeTruthy();
	});
});
