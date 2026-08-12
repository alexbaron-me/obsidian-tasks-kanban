import type { App } from 'obsidian';
import { useState } from 'preact/hooks';
import type { RenderedLane } from '../../board/renderPipeline';
import { laneHue, laneInitials, laneTotal, type CanonicalColumn } from '../../board/laneGrid';
import type { ChipKind } from '../../types/board';
import type { QueryContext } from '../../query/context';
import type { Task } from '../../types/tasks';
import type { TaskWriter } from '../../write/TaskWriter';
import type { CompiledAccentRule } from '../../board/accent';
import { Column } from './Column';

export interface LaneProps {
	app: App;
	lane: RenderedLane;
	/** Nesting depth (0 = top level) — indents the header bar for a nested lane. */
	depth: number;
	/** True for a lane that only exists to group its `nested` children (see `flattenLanes`) —
	 * renders a plain section heading instead of a header bar + cells. */
	isGroupHeading: boolean;
	/** False for the single implicit lane when the view has no `lanes` grouping — no header bar,
	 * cards render directly under the shared column headers. */
	showHeader: boolean;
	columns: readonly CanonicalColumn[];
	chips: readonly ChipKind[];
	ctx: QueryContext;
	accentRules: CompiledAccentRule[];
	clickAction: 'file' | 'modal' | 'preview' | 'none';
	taskWriter: TaskWriter;
	postponeField?: 'due' | 'scheduled';
	globalFilterTag?: string;
	collapseDefault: boolean;
	onToggleDone: (task: Task) => void;
	onEdit: (task: Task) => void;
	onOpenFile: (task: Task) => void;
	onTagClick?: (tag: string) => void;
	onQuickAdd: (laneId: string, bucketId: string) => void;
	onRemoveOrderOverride?: (task: Task) => void;
}

/**
 * One horizontal band of the Jira-style board grid: a full-width header bar (chevron, avatar
 * swatch, label, issue count) followed by one cell per shared column, all sharing the parent
 * grid's column tracks so everything lines up — see BoardShell's `.tasks-board-grid`.
 */
export function Lane(props: LaneProps) {
	const [collapsed, setCollapsed] = useState(props.collapseDefault);
	const { lane } = props;

	if (props.isGroupHeading) {
		return (
			<div class="tasks-board-grid__group-heading" style={{ paddingLeft: `${8 + props.depth * 16}px` }}>
				{lane.label || '(none)'}
			</div>
		);
	}

	const count = laneTotal(lane);

	return (
		<>
			{props.showHeader ? (
				<button
					type="button"
					class="tasks-board-grid__lane-header"
					style={{ paddingLeft: `${8 + props.depth * 16}px` }}
					aria-label={`${collapsed ? 'Expand' : 'Collapse'} lane ${lane.label || '(none)'}`}
					onClick={() => setCollapsed((c) => !c)}
				>
					<span class="tasks-board-grid__lane-collapse" aria-hidden="true">
						{collapsed ? '▸' : '▾'}
					</span>
					<span class="tasks-board-grid__lane-avatar" style={{ '--tasks-board-lane-hue': String(laneHue(lane.label)) }}>
						{laneInitials(lane.label) || '—'}
					</span>
					<span class="tasks-board-grid__lane-label">{lane.label || '(none)'}</span>
					<span class="tasks-board-grid__lane-count">
						{count} issue{count === 1 ? '' : 's'}
					</span>
				</button>
			) : null}
			{!props.showHeader || !collapsed
				? props.columns.map((col) => (
						<Column
							key={col.id}
							app={props.app}
							laneId={lane.id}
							column={lane.columns.find((c) => c.bucket.id === col.id) ?? null}
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
							onQuickAdd={(c) => props.onQuickAdd(lane.id, c.bucket.id)}
							onRemoveOrderOverride={props.onRemoveOrderOverride}
						/>
					))
				: null}
		</>
	);
}
