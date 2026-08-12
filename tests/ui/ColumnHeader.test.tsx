import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/preact';
import { ColumnHeader } from '../../src/ui/components/ColumnHeader';
import { makeTask } from '../fixtures/tasks';
import type { GridColumn } from '../../src/board/boardGrid';

afterEach(cleanup);

function col(overrides: Partial<GridColumn> = {}): GridColumn {
	return { id: 'doing', label: 'Doing', ...overrides };
}

describe('ColumnHeader', () => {
	it('renders the label and the board-wide count', () => {
		render(<ColumnHeader column={col()} index={0} tasks={[makeTask(), makeTask()]} />);
		expect(screen.getByText('Doing')).toBeTruthy();
		expect(screen.getByText('2')).toBeTruthy();
	});

	it('shows the WIP limit alongside the count', () => {
		render(<ColumnHeader column={col({ wip: { max: 3 } })} index={0} tasks={[makeTask(), makeTask()]} />);
		expect(screen.getByText('2 / 3')).toBeTruthy();
	});

	it('marks the count as at-limit once it reaches the WIP max', () => {
		const { container } = render(<ColumnHeader column={col({ wip: { max: 2 } })} index={0} tasks={[makeTask(), makeTask()]} />);
		expect(container.querySelector('.tasks-board-col__count--at-limit')).toBeTruthy();
	});

	it('leaves the count unmarked below the WIP max', () => {
		const { container } = render(<ColumnHeader column={col({ wip: { max: 5 } })} index={0} tasks={[makeTask()]} />);
		expect(container.querySelector('.tasks-board-col__count--at-limit')).toBeFalsy();
	});

	it('renders an urgency rollup when configured', () => {
		render(
			<ColumnHeader column={col({ rollups: ['urgency'] })} index={0} tasks={[makeTask({ urgency: 1.5 }), makeTask({ urgency: 2.5 })]} />,
		);
		expect(screen.getByText('Σ 4.0')).toBeTruthy();
	});

	it('renders a priority rollup when configured', () => {
		render(
			<ColumnHeader
				column={col({ rollups: ['priority'] })}
				index={0}
				tasks={[makeTask({ priorityName: 'high' }), makeTask({ priorityName: 'none' })]}
			/>,
		);
		expect(screen.getByText('1 prioritized')).toBeTruthy();
	});

	it('renders no rollups group when none are configured', () => {
		const { container } = render(<ColumnHeader column={col()} index={0} tasks={[]} />);
		expect(container.querySelector('.tasks-board-col__rollups')).toBeFalsy();
	});

	it('draws a leading divider on every column but the first', () => {
		const first = render(<ColumnHeader column={col()} index={0} tasks={[]} />);
		expect(first.container.querySelector('.tasks-board-col--divided')).toBeFalsy();
		cleanup();

		const second = render(<ColumnHeader column={col()} index={1} tasks={[]} />);
		expect(second.container.querySelector('.tasks-board-col--divided')).toBeTruthy();
	});
});
