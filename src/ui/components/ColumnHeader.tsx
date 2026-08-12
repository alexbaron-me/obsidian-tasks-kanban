import type { Task } from '../../types/tasks';
import type { GridColumn } from '../../board/boardGrid';

export interface ColumnHeaderProps {
	column: GridColumn;
	/** Every task in this column across every lane — the column is summarised once here rather than
	 * repeated in each lane's cell. */
	tasks: readonly Task[];
	/** Position in the shared column set; every column but the first draws a leading hairline. */
	index: number;
}

function urgencySum(tasks: readonly Task[]): number {
	return tasks.reduce((sum, task) => sum + task.urgency, 0);
}

/**
 * One column's identity, rendered once above every lane: name, board-wide count, WIP limit and
 * rollups on a single compact line. Lane-level identity lives in the lane header instead, so this
 * row stays quiet enough to scan across.
 */
export function ColumnHeader(props: ColumnHeaderProps) {
	const { column, tasks } = props;
	const count = tasks.length;
	const atLimit = column.wip !== undefined && count >= column.wip.max;
	const rollups = column.rollups ?? [];

	return (
		<div
			class={`tasks-board-col${props.index > 0 ? ' tasks-board-col--divided' : ''}`}
			data-bucket-id={column.id}
		>
			<span class="tasks-board-col__label">{column.label}</span>
			<span class={`tasks-board-col__count${atLimit ? ' tasks-board-col__count--at-limit' : ''}`}>
				{count}
				{column.wip ? ` / ${column.wip.max}` : ''}
			</span>
			{rollups.length > 0 ? (
				<span class="tasks-board-col__rollups">
					{rollups.includes('urgency') ? <span>Σ {urgencySum(tasks).toFixed(1)}</span> : null}
					{rollups.includes('priority') ? (
						<span>{tasks.filter((t) => t.priorityName !== 'none').length} prioritized</span>
					) : null}
				</span>
			) : null}
		</div>
	);
}
