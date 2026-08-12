import type { Task } from '../../types/tasks';
import type { CanonicalColumn } from '../../board/laneGrid';

export interface ColumnHeaderProps {
	column: CanonicalColumn;
	tasks: readonly Task[];
}

function urgencySum(tasks: readonly Task[]): number {
	return tasks.reduce((sum, t) => sum + t.urgency, 0);
}

/** Renders once per board column, above every swimlane row — label, aggregate count (across every
 * lane), WIP limit, and rollups. Per-lane identity lives in the lane header bar instead. */
export function ColumnHeader(props: ColumnHeaderProps) {
	const { column, tasks } = props;
	const count = tasks.length;
	const atLimit = column.wip ? count >= column.wip.max : false;
	const rollups = column.rollups ?? [];

	return (
		<div class="tasks-board-grid__header-cell" data-bucket-id={column.id}>
			<div class="tasks-board-grid__header-top">
				<span class="tasks-board-grid__header-label">{column.label}</span>
				<span class={`tasks-board-grid__header-count${atLimit ? ' tasks-board-grid__header-count--at-limit' : ''}`}>
					{count}
					{column.wip ? ` / ${column.wip.max}` : ''}
				</span>
			</div>
			{rollups.length > 0 ? (
				<div class="tasks-board-grid__header-rollups">
					{rollups.includes('urgency') ? <span>Σ {urgencySum(tasks).toFixed(1)}</span> : null}
					{rollups.includes('priority') ? <span>{tasks.filter((t) => t.priorityName !== 'none').length} prioritized</span> : null}
				</div>
			) : null}
		</div>
	);
}
