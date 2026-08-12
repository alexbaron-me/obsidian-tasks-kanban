import type { BucketOverride } from '../types/board';
import type { Task } from '../types/tasks';
import type { RenderedLane } from './renderPipeline';

/**
 * `lane`    — a leaf lane, rendered as a header plus one cell per column.
 * `section` — a lane that was split by the nested `group by` instruction. It still carries the full
 *             pre-split task set, which would double-count against its children if it were also
 *             given cells, so it renders as a plain heading and its children carry the tasks.
 */
export type LaneRowKind = 'lane' | 'section';

export interface LaneRow {
	lane: RenderedLane;
	/** 0 for a top-level lane, 1 for a lane nested under a section — indents the header. */
	depth: number;
	kind: LaneRowKind;
}

/**
 * Flattens the (at most two-level) lane tree into the linear row list the board renders. Keeping
 * every lane at the same DOM level is what lets one CSS grid own the column tracks, so the shared
 * column headers and every lane's cells stay aligned no matter how deep the grouping goes.
 */
export function flattenSwimlanes(lanes: readonly RenderedLane[], depth = 0): LaneRow[] {
	const rows: LaneRow[] = [];
	for (const lane of lanes) {
		const isSection = lane.children !== null && lane.children.length > 0;
		rows.push({ lane, depth, kind: isSection ? 'section' : 'lane' });
		if (isSection) rows.push(...flattenSwimlanes(lane.children!, depth + 1));
	}
	return rows;
}

/** A board column as the shared header row sees it: identity plus the limits and rollups that are
 * reported once for the whole column rather than per lane. */
export interface GridColumn {
	id: string;
	label: string;
	wip?: { max: number; mode?: 'soft' | 'hard' };
	rollups?: BucketOverride['rollups'];
}

/**
 * The ordered column set the whole board shares, in first-appearance order across lane rows.
 *
 * Each lane buckets its own tasks independently, so their column lists are identical for the
 * `explicit` and `rolling` generators (the spec is shared) but can differ for `auto`, which derives
 * buckets from the tasks actually present in that lane. Taking the union here means a lane that is
 * missing a column renders an empty cell in that track instead of shifting its neighbours.
 */
export function gridColumns(rows: readonly LaneRow[]): GridColumn[] {
	const columns = new Map<string, GridColumn>();
	for (const row of rows) {
		if (row.kind === 'section') continue;
		for (const column of row.lane.columns) {
			if (columns.has(column.bucket.id)) continue;
			columns.set(column.bucket.id, {
				id: column.bucket.id,
				label: column.bucket.label,
				wip: column.bucket.override.wip,
				rollups: column.bucket.override.rollups,
			});
		}
	}
	return [...columns.values()];
}

/** Every task in one column, gathered across all lanes — backs the shared header's count and
 * rollups. Section rows are skipped so nested lanes aren't counted twice. */
export function columnTasks(rows: readonly LaneRow[], columnId: string): Task[] {
	const tasks: Task[] = [];
	for (const row of rows) {
		if (row.kind === 'section') continue;
		const column = row.lane.columns.find((c) => c.bucket.id === columnId);
		if (column) tasks.push(...column.tasks);
	}
	return tasks;
}

/** Board-wide task count for one column — the number beside the shared column header. */
export function columnCount(rows: readonly LaneRow[], columnId: string): number {
	return columnTasks(rows, columnId).length;
}

/** Task count across every column of one lane — the number beside that lane's header. */
export function laneCount(lane: RenderedLane): number {
	return lane.columns.reduce((total, column) => total + column.tasks.length, 0);
}

/** Task count for one lane in one column — the per-column figure a collapsed lane summarises with,
 * so a folded lane still shows where its work sits. */
export function laneColumnCount(lane: RenderedLane, columnId: string): number {
	return lane.columns.find((c) => c.bucket.id === columnId)?.tasks.length ?? 0;
}

/** A small curated palette rather than the full hue circle: arbitrary hues collide and muddy at
 * this size, whereas eight well-separated ones stay distinguishable as lane markers. */
const LANE_HUES = [210, 265, 320, 355, 25, 45, 145, 185];

/** A stable hue for a lane's marker dot, so the same label always reads the same colour without
 * anyone maintaining a label -> colour map. */
export function laneHue(label: string): number {
	let hash = 0;
	for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
	return LANE_HUES[hash % LANE_HUES.length]!;
}
