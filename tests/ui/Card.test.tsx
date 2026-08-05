// Tests exercise `CardView`, the presentational component with no `@dnd-kit` hook calls of its
// own (see src/ui/components/Card.tsx). `Card` itself just wraps CardView with drag/drop wiring
// that's covered independently by tests/board/dropController.test.ts.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { App } from 'obsidian';
import moment from 'moment';
import { CardView, type CardViewProps } from '../../src/ui/components/Card';
import { TaskWriter } from '../../src/write/TaskWriter';
import { FieldWriter } from '../../src/write/FieldWriter';
import { TasksApi } from '../../src/integration/TasksApi';
import { TasksCache } from '../../src/integration/TasksCache';
import { makeTask } from '../fixtures/tasks';
import type { QueryContext } from '../../src/query/context';

afterEach(cleanup);

function ctx(allTasks: ReturnType<typeof makeTask>[] = []): QueryContext {
	return {
		file: { path: 'board.md', root: '/', folder: '', filename: 'board.md', filenameWithoutExtension: 'board', frontmatter: {} },
		allTasks,
		boardId: 'board.md',
		viewName: 'Test',
		today: moment(),
	};
}

function renderCard(overrides: Partial<CardViewProps> = {}) {
	const app = new App();
	const taskWriter = new TaskWriter(app, new FieldWriter('emoji'), new TasksApi(app), new TasksCache(app));
	const task = overrides.task ?? makeTask({ description: 'Write the report' });
	const onToggleDone = vi.fn();
	const onEdit = vi.fn();
	const onOpenFile = vi.fn();
	const utils = render(
		<CardView
			app={app}
			task={task}
			chips={['due', 'priority', 'tags']}
			ctx={ctx([task])}
			accent={null}
			clickAction="file"
			taskWriter={taskWriter}
			onToggleDone={onToggleDone}
			onEdit={onEdit}
			onOpenFile={onOpenFile}
			nodeRef={() => {}}
			extraClass=""
			style={{}}
			dragListeners={{}}
			dragAttributes={{}}
			{...overrides}
		/>,
	);
	return { task, onToggleDone, onEdit, onOpenFile, ...utils };
}

describe('CardView', () => {
	it('renders the task description', () => {
		renderCard();
		expect(screen.getByText('Write the report')).toBeTruthy();
	});

	it('checkbox reflects a done status', () => {
		const task = makeTask({ description: 'Done thing', status: 'x', done: moment().format('YYYY-MM-DD') });
		renderCard({ task });
		const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
		expect(checkbox.checked).toBe(true);
	});

	it('checkbox reflects a not-done status', () => {
		const task = makeTask({ description: 'Todo thing', status: ' ' });
		renderCard({ task });
		const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
		expect(checkbox.checked).toBe(false);
	});

	it('clicking the checkbox calls onToggleDone with the task', () => {
		const { task, onToggleDone } = renderCard();
		fireEvent.click(screen.getByRole('checkbox'));
		expect(onToggleDone).toHaveBeenCalledWith(task);
	});

	it('renders a priority chip when set', () => {
		const task = makeTask({ description: 'High prio', priorityName: 'high' });
		renderCard({ task });
		expect(screen.getByText(/high/)).toBeTruthy();
	});

	it('renders one pill per tag', () => {
		const task = makeTask({ description: 'Tagged', tags: ['#work', '#home'] });
		renderCard({ task, chips: ['tags'] });
		expect(screen.getByText('#work')).toBeTruthy();
		expect(screen.getByText('#home')).toBeTruthy();
	});

	it('dims a blocked card', () => {
		const blocker = makeTask({ id: 'b1', status: ' ' });
		const task = makeTask({ description: 'Blocked thing', dependsOn: ['b1'] });
		const { container } = renderCard({ task, chips: [], ctx: ctx([blocker, task]), clickAction: 'none' });
		expect(container.querySelector('.tasks-board-card--blocked')).toBeTruthy();
	});

	it('does not dim an unblocked card', () => {
		const { container } = renderCard();
		expect(container.querySelector('.tasks-board-card--blocked')).toBeFalsy();
	});

	it('clicking the description switches to inline edit mode', () => {
		renderCard();
		fireEvent.click(screen.getByText('Write the report'));
		expect(screen.getByRole('textbox')).toBeTruthy();
	});

	it('pressing Space toggles done from the keyboard', () => {
		const { task, onToggleDone } = renderCard();
		fireEvent.keyDown(screen.getByRole('checkbox').closest('.tasks-board-card')!, { key: ' ' });
		expect(onToggleDone).toHaveBeenCalledWith(task);
	});

	it('pressing E opens the edit modal from the keyboard', () => {
		const { task, onEdit } = renderCard();
		const card = screen.getByRole('checkbox').closest('.tasks-board-card')!;
		fireEvent.keyDown(card, { key: 'E' });
		expect(onEdit).toHaveBeenCalledWith(task);
	});
});
