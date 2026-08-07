import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/preact';
import { ColumnHeader } from '../../src/ui/components/ColumnHeader';
import { makeTask } from '../fixtures/tasks';
import type { CanonicalColumn } from '../../src/board/laneGrid';

afterEach(cleanup);

function col(overrides: Partial<CanonicalColumn> = {}): CanonicalColumn {
	return { id: 'doing', label: 'Doing', ...overrides };
}

describe('ColumnHeader', () => {
	it('renders the label and aggregate count', () => {
		render(<ColumnHeader column={col()} tasks={[makeTask(), makeTask()]} />);
		expect(screen.getByText('Doing')).toBeTruthy();
		expect(screen.getByText('2')).toBeTruthy();
	});

	it('shows the WIP limit alongside the count', () => {
		render(<ColumnHeader column={col({ wip: { max: 3 } })} tasks={[makeTask(), makeTask()]} />);
		expect(screen.getByText('2 / 3')).toBeTruthy();
	});

	it('marks the counter as at-limit once the count reaches the WIP max', () => {
		const { container } = render(<ColumnHeader column={col({ wip: { max: 2 } })} tasks={[makeTask(), makeTask()]} />);
		expect(container.querySelector('.tasks-board-grid__header-count--at-limit')).toBeTruthy();
	});

	it('renders an urgency rollup when configured', () => {
		render(<ColumnHeader column={col({ rollups: ['urgency'] })} tasks={[makeTask({ urgency: 1.5 }), makeTask({ urgency: 2.5 })]} />);
		expect(screen.getByText('Σ 4.0')).toBeTruthy();
	});

	it('renders a priority rollup when configured', () => {
		render(
			<ColumnHeader
				column={col({ rollups: ['priority'] })}
				tasks={[makeTask({ priorityName: 'high' }), makeTask({ priorityName: 'none' })]}
			/>,
		);
		expect(screen.getByText('1 prioritized')).toBeTruthy();
	});

	it('renders no rollups row when none are configured', () => {
		const { container } = render(<ColumnHeader column={col()} tasks={[]} />);
		expect(container.querySelector('.tasks-board-grid__header-rollups')).toBeFalsy();
	});
});
