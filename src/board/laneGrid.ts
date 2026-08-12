import type { BucketOverride } from '../types/board';
import type { Task } from '../types/tasks';
import type { RenderedLane } from './renderPipeline';

export interface FlatLaneRow {
	lane: RenderedLane;
	depth: number;
	/** True when this lane only exists to group its `nested` children — it carries the full,
	 * un-split task set (see `buildLanes`), which would double-count against its children if its
	 * own cells were also rendered. Callers should render a heading for it, not a cell row. */
	isGroupHeading: boolean;
}

/**
 * Flattens (possibly one level of) nested swimlanes into an ordered list of rows for the Jira-
 * style grid, where every lane is a horizontal band rather than its own mini board. A lane with
 * `nested` children contributes a heading row (no cells) followed by each child's row, so tasks
 * are never counted in both the parent and the child.
 */
export function flattenLanes(lanes: readonly RenderedLane[], depth = 0): FlatLaneRow[] {
	const out: FlatLaneRow[] = [];
	for (const lane of lanes) {
		const hasNested = lane.nested !== null && lane.nested.length > 0;
		out.push({ lane, depth, isGroupHeading: hasNested });
		if (hasNested) out.push(...flattenLanes(lane.nested!, depth + 1));
	}
	return out;
}

export interface CanonicalColumn {
	id: string;
	label: string;
	wip?: { max: number; mode?: 'soft' | 'hard' };
	rollups?: BucketOverride['rollups'];
}

/**
 * The board's column headers render once, above every swimlane row, so every row's cells need to
 * line up against the same ordered set of buckets — even though each lane computes its own bucket
 * list independently (one `generateBuckets` call per lane). Buckets are identical across lanes for
 * the "explicit"/"rolling" generators (the spec is shared); only "auto" can vary per lane, since it
 * derives buckets from that lane's own tasks. Order follows first appearance across leaf rows.
 */
export function canonicalColumns(rows: readonly FlatLaneRow[]): CanonicalColumn[] {
	const seen = new Map<string, CanonicalColumn>();
	for (const row of rows) {
		if (row.isGroupHeading) continue;
		for (const col of row.lane.columns) {
			if (!seen.has(col.bucket.id)) {
				seen.set(col.bucket.id, {
					id: col.bucket.id,
					label: col.bucket.label,
					wip: col.bucket.override.wip,
					rollups: col.bucket.override.rollups,
				});
			}
		}
	}
	return [...seen.values()];
}

/** Every task in one canonical column, gathered across every leaf row — backs both the shared
 * header's count/rollups and (via `.length`) `columnTotal`. */
export function columnTasksAcrossRows(rows: readonly FlatLaneRow[], columnId: string): Task[] {
	const tasks: Task[] = [];
	for (const row of rows) {
		if (row.isGroupHeading) continue;
		const col = row.lane.columns.find((c) => c.bucket.id === columnId);
		if (col) tasks.push(...col.tasks);
	}
	return tasks;
}

/** Total task count for one canonical column, summed across every leaf row — the number shown in
 * the shared column header. */
export function columnTotal(rows: readonly FlatLaneRow[], columnId: string): number {
	return columnTasksAcrossRows(rows, columnId).length;
}

/** Total task count across every canonical column for one lane row — the "N issues" shown next to
 * a swimlane's label. */
export function laneTotal(lane: RenderedLane): number {
	return lane.columns.reduce((sum, col) => sum + col.tasks.length, 0);
}

/** One or two letters for a lane's avatar swatch, derived from its label — "Emiliano Sala" -> "ES",
 * "urgent" -> "UR", "" -> "". */
export function laneInitials(label: string): string {
	const parts = label.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '';
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
	return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** A deterministic hue (0-359) for a lane's avatar swatch background, so the same label always
 * gets the same colour without maintaining a lane-id -> colour map. */
export function laneHue(label: string): number {
	let hash = 0;
	for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
	return hash % 360;
}
