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
	/** Null when this lane has no bucket for this column — only possible with the "auto" column
	 * generator, whose buckets are derived per-lane (see `canonicalColumns`). */
	column: RenderedColumn | null;
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

/** One swimlane row's cell for one board column: just the card list plus a lightweight quick-add
 * affordance. Column identity (label, aggregate count, WIP, rollups) renders once, in the shared
 * header row above every lane — see ColumnHeader. */
export function Column(props: ColumnProps) {
	const { column } = props;
	if (!column) return <div class="tasks-board-cell tasks-board-cell--empty" />;

	return (
		<div class="tasks-board-cell" data-bucket-id={column.bucket.id}>
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
			<button type="button" class="tasks-board-cell__quick-add" onClick={() => props.onQuickAdd(column)}>
				+ Add task
			</button>
		</div>
	);
}
