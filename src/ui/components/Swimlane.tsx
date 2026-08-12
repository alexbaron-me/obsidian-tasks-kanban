import type { App } from 'obsidian';
import { useState } from 'preact/hooks';
import type { RenderedLane } from '../../board/renderPipeline';
import { laneColumnCount, laneCount, laneHue, type GridColumn, type LaneRowKind } from '../../board/boardGrid';
import type { ChipKind } from '../../types/board';
import type { QueryContext } from '../../query/context';
import type { Task } from '../../types/tasks';
import type { TaskWriter } from '../../write/TaskWriter';
import type { CompiledAccentRule } from '../../board/accent';
import { Column } from './Column';

export interface SwimlaneProps {
	app: App;
	lane: RenderedLane;
	/** `section` renders a heading only — see `flattenSwimlanes`. */
	kind: LaneRowKind;
	/** 0 for a top-level lane, 1 for a lane nested under a section. */
	depth: number;
	/** False for the implicit lane of an ungrouped view: cards sit straight under the column
	 * headers with no band of their own. */
	showHeader: boolean;
	columns: readonly GridColumn[];
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

/** Indent per nesting level, in px — matches the chevron column so a nested lane's label lines up
 * under its parent's. */
const DEPTH_INDENT = 14;

/**
 * One horizontal band of the board: a compact header row spanning every column, followed by this
 * lane's cells. Header and cells are emitted as siblings rather than wrapped in a container, so
 * they remain direct children of the board grid and share its column tracks.
 *
 * Collapsing swaps the cells for a single row of per-column counts, so a folded lane still shows
 * where its work sits instead of vanishing entirely.
 */
export function Swimlane(props: SwimlaneProps) {
	const [collapsed, setCollapsed] = useState(props.collapseDefault);
	const { lane } = props;
	const indent = { paddingInlineStart: `${8 + props.depth * DEPTH_INDENT}px` };

	// Both row types below put their text in an inner element rather than directly on the full-width
	// row, so styles.css can pin it to the left edge of the scrollport. A row spanning every column
	// would otherwise carry its label out of view as soon as the board scrolls horizontally — which
	// the one-column-per-screen mobile layout does immediately.
	if (props.kind === 'section') {
		return (
			<div class="tasks-board-section">
				<span class="tasks-board-section__label" style={indent}>
					{lane.label || '(none)'}
				</span>
			</div>
		);
	}

	const count = laneCount(lane);
	const showCells = !props.showHeader || !collapsed;

	return (
		<>
			{props.showHeader ? (
				<button
					type="button"
					class="tasks-board-lane"
					aria-expanded={!collapsed}
					aria-label={`${lane.label || '(none)'}, ${count} task${count === 1 ? '' : 's'}`}
					onClick={() => setCollapsed((value) => !value)}
				>
					<span class="tasks-board-lane__inner" style={indent}>
						<span class={`tasks-board-lane__chevron${collapsed ? ' is-collapsed' : ''}`} aria-hidden="true" />
						{props.depth === 0 ? (
							<span
								class="tasks-board-lane__dot"
								style={{ '--tasks-board-lane-hue': String(laneHue(lane.label)) }}
								aria-hidden="true"
							/>
						) : null}
						<span class="tasks-board-lane__label">{lane.label || '(none)'}</span>
						<span class="tasks-board-lane__count">{count}</span>
					</span>
				</button>
			) : null}

			{showCells
				? props.columns.map((column, index) => (
						<Column
							key={column.id}
							app={props.app}
							laneId={lane.id}
							index={index}
							column={lane.columns.find((c) => c.bucket.id === column.id) ?? null}
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
				: props.columns.map((column, index) => {
						const columnCount = laneColumnCount(lane, column.id);
						return (
							<div
								key={column.id}
								class={`tasks-board-lane-summary${index > 0 ? ' tasks-board-cell--divided' : ''}`}
								data-bucket-id={column.id}
							>
								{columnCount > 0 ? <span>{columnCount}</span> : null}
							</div>
						);
					})}
		</>
	);
}
