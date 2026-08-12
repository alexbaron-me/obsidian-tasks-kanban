import type { App } from 'obsidian';
import type { RenderedColumn } from '../../board/renderPipeline';
import type { ChipKind } from '../../types/board';
import type { QueryContext } from '../../query/context';
import type { Task } from '../../types/tasks';
import type { TaskWriter } from '../../write/TaskWriter';
import type { CompiledAccentRule } from '../../board/accent';
import { CardList } from './CardList';

export interface ColumnProps {
	app: App;
	laneId: string;
	/** Null when this lane has no bucket for this column — only reachable with the `auto` column
	 * generator, whose buckets come from each lane's own tasks. */
	column: RenderedColumn | null;
	/** Position in the shared column set; every column but the first draws a leading hairline. */
	index: number;
	chips: readonly ChipKind[];
	ctx: QueryContext;
	accentRules: CompiledAccentRule[];
	clickAction: 'file' | 'modal' | 'preview' | 'none';
	taskWriter: TaskWriter;
	postponeField?: 'due' | 'scheduled';
	globalFilterTag?: string;
	onToggleDone: (task: Task) => void;
	onEdit: (task: Task) => void;
	onOpenFile: (task: Task) => void;
	onTagClick?: (tag: string) => void;
	onQuickAdd: (column: RenderedColumn) => void;
	onRemoveOrderOverride?: (task: Task) => void;
}

/** One lane's cell for one column: the card list plus a quick-add affordance that stays out of the
 * way until the cell is hovered or focused. */
export function Column(props: ColumnProps) {
	const { column } = props;
	const divided = props.index > 0 ? ' tasks-board-cell--divided' : '';

	if (!column) return <div class={`tasks-board-cell tasks-board-cell--empty${divided}`} />;

	return (
		<div class={`tasks-board-cell${divided}`} data-bucket-id={column.bucket.id}>
			<CardList
				app={props.app}
				bucketId={column.bucket.id}
				laneId={props.laneId}
				bucket={column.bucket}
				tasks={column.tasks}
				chips={props.chips}
				ctx={props.ctx}
				accentRules={props.accentRules}
				clickAction={props.clickAction}
				taskWriter={props.taskWriter}
				postponeField={props.postponeField}
				globalFilterTag={props.globalFilterTag}
				onToggleDone={props.onToggleDone}
				onEdit={props.onEdit}
				onOpenFile={props.onOpenFile}
				onTagClick={props.onTagClick}
				onRemoveOrderOverride={props.onRemoveOrderOverride}
			/>
			<button
				type="button"
				class="tasks-board-cell__add"
				aria-label={`Add task to ${column.bucket.label}`}
				onClick={() => props.onQuickAdd(column)}
			>
				<span class="tasks-board-cell__add-icon" aria-hidden="true">
					+
				</span>
				Add task
			</button>
		</div>
	);
}
