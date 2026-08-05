import type { App } from 'obsidian';
import { useState } from 'preact/hooks';
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
	column: RenderedColumn;
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

function urgencySum(tasks: readonly Task[]): number {
	return tasks.reduce((sum, t) => sum + t.urgency, 0);
}

export function Column(props: ColumnProps) {
	const [collapsed, setCollapsed] = useState(props.column.bucket.override.collapsed ?? false);
	const { bucket, tasks } = props.column;
	const wip = bucket.override.wip;
	const atLimit = wip ? tasks.length >= wip.max : false;
	const rollups = bucket.override.rollups ?? [];

	return (
		<div class={`tasks-board-column${collapsed ? ' tasks-board-column--collapsed' : ''}`} data-bucket-id={bucket.id}>
			<div class="tasks-board-column__header">
				<button
					type="button"
					class="tasks-board-column__collapse"
					aria-label={collapsed ? 'Expand column' : 'Collapse column'}
					onClick={() => setCollapsed((c) => !c)}
				>
					{collapsed ? '▸' : '▾'}
				</button>
				<span class="tasks-board-column__label">{bucket.label}</span>
				<span class={`tasks-board-column__count${atLimit ? ' tasks-board-column__count--at-limit' : ''}`}>
					{tasks.length}
					{wip ? ` / ${wip.max}` : ''}
				</span>
				<button type="button" class="tasks-board-column__quick-add" aria-label="Add task" onClick={() => props.onQuickAdd(props.column)}>
					+
				</button>
			</div>
			{rollups.length > 0 ? (
				<div class="tasks-board-column__rollups">
					{rollups.includes('urgency') ? <span>Σ {urgencySum(tasks).toFixed(1)}</span> : null}
					{rollups.includes('priority') ? (
						<span class="tasks-board-column__priority-histogram">
							{tasks.filter((t) => t.priorityName !== 'none').length} prioritized
						</span>
					) : null}
				</div>
			) : null}
			{!collapsed ? (
				<CardList
					app={props.app}
					bucketId={bucket.id}
					laneId={props.laneId}
					bucket={bucket}
					tasks={tasks}
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
			) : null}
		</div>
	);
}
