import type { App } from 'obsidian';
import { useState } from 'preact/hooks';
import type { RenderedColumn, RenderedLane } from '../../board/renderPipeline';
import type { ChipKind } from '../../types/board';
import type { QueryContext } from '../../query/context';
import type { Task } from '../../types/tasks';
import type { TaskWriter } from '../../write/TaskWriter';
import type { CompiledAccentRule } from '../../board/accent';
import { Column } from './Column';

export interface LaneProps {
	app: App;
	lane: RenderedLane;
	chips: readonly ChipKind[];
	ctx: QueryContext;
	accentRules: CompiledAccentRule[];
	clickAction: 'file' | 'modal' | 'preview' | 'none';
	taskWriter: TaskWriter;
	collapseDefault: boolean;
	onToggleDone: (task: Task) => void;
	onEdit: (task: Task) => void;
	onOpenFile: (task: Task) => void;
	onTagClick?: (tag: string) => void;
	onQuickAdd: (laneId: string, column: RenderedColumn) => void;
}

export function Lane(props: LaneProps) {
	const [collapsed, setCollapsed] = useState(props.collapseDefault);
	const { lane } = props;
	const isUngrouped = lane.label === '' && lane.id === '__all__';

	return (
		<div class="tasks-board-lane" data-lane-id={lane.id}>
			{!isUngrouped ? (
				<div class="tasks-board-lane__header">
					<button
						type="button"
						class="tasks-board-lane__collapse"
						aria-label={collapsed ? 'Expand lane' : 'Collapse lane'}
						onClick={() => setCollapsed((c) => !c)}
					>
						{collapsed ? '▸' : '▾'}
					</button>
					<span class="tasks-board-lane__label">{lane.label}</span>
				</div>
			) : null}
			{!collapsed ? (
				<div class="tasks-board-lane__columns">
					{lane.columns.map((column) => (
						<Column
							key={column.bucket.id}
							app={props.app}
							laneId={lane.id}
							column={column}
							chips={props.chips}
							ctx={props.ctx}
							accentRules={props.accentRules}
							clickAction={props.clickAction}
							taskWriter={props.taskWriter}
							onToggleDone={props.onToggleDone}
							onEdit={props.onEdit}
							onOpenFile={props.onOpenFile}
							onTagClick={props.onTagClick}
							onQuickAdd={(col) => props.onQuickAdd(lane.id, col)}
						/>
					))}
				</div>
			) : null}
			{!collapsed && lane.nested
				? lane.nested.map((nested) => (
						<Lane
							key={nested.id}
							app={props.app}
							lane={nested}
							chips={props.chips}
							ctx={props.ctx}
							accentRules={props.accentRules}
							clickAction={props.clickAction}
							taskWriter={props.taskWriter}
							collapseDefault={props.collapseDefault}
							onToggleDone={props.onToggleDone}
							onEdit={props.onEdit}
							onOpenFile={props.onOpenFile}
							onTagClick={props.onTagClick}
							onQuickAdd={props.onQuickAdd}
						/>
					))
				: null}
		</div>
	);
}
