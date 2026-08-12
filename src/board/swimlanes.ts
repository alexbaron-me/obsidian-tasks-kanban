import { moment } from 'obsidian';
import { compileQuery } from '../query/compile';
import { parseQuery, type GroupField } from '../query/parse';
import type { QueryContext } from '../query/context';
import type { BucketWriteValue, LaneSpec } from '../types/board';
import type { Task } from '../types/tasks';

/**
 * One swimlane: the tasks sharing a single `group by` key. `children` is non-null only when the
 * view's nested instruction split this lane further — the board supports at most two levels.
 */
export interface Swimlane {
	id: string;
	label: string;
	tasks: Task[];
	children: Swimlane[] | null;
}

/** The implicit lane a view with no `lanes` spec renders into: one unlabelled band holding every
 * task, so the rest of the pipeline never needs a "grouped or not" branch. */
export const UNGROUPED_LANE_ID = '__all__';

/** The key a task lands under when its group function yields nothing (no tags, no due date, …). */
const NO_KEY_LABEL = '(none)';

function ungroupedLane(tasks: readonly Task[]): Swimlane {
	return { id: UNGROUPED_LANE_ID, label: '', tasks: [...tasks], children: null };
}

function groupInto(
	groupByText: string,
	tasks: readonly Task[],
	ctx: QueryContext,
): { lanes: Swimlane[]; warnings: string[] } {
	const compiled = compileQuery(groupByText);
	const warnings = compiled.errors.map((e) => e.message);
	if (!compiled.group) return { lanes: [ungroupedLane(tasks)], warnings };

	const byKey = new Map<string, Task[]>();
	for (const task of tasks) {
		const keys = compiled.group(task, ctx);
		// A group function returning several keys places the task in each lane. This is the only
		// point where a card is duplicated on the board, and it matches how the Tasks plugin's own
		// `group by tags` behaves.
		for (const key of keys.length > 0 ? keys : [NO_KEY_LABEL]) {
			const existing = byKey.get(key);
			if (existing) existing.push(task);
			else byKey.set(key, [task]);
		}
	}

	const keys = [...byKey.keys()].sort((a, b) => a.localeCompare(b));
	if (compiled.groupReverse) keys.reverse();

	return {
		lanes: keys.map((key) => ({ id: key, label: key, tasks: byKey.get(key)!, children: null })),
		warnings,
	};
}

/**
 * Groups tasks into swimlanes per the view's LaneSpec, applying the nested instruction (if any) to
 * each top-level lane in turn. A null spec yields the single ungrouped lane.
 *
 * A parent lane keeps its own full task list even after being split: `flattenSwimlanes` renders it
 * as a section heading rather than a row of cells, so those tasks are only ever counted once, via
 * the children.
 */
export function buildSwimlanes(
	spec: LaneSpec | null,
	tasks: readonly Task[],
	ctx: QueryContext,
): { lanes: Swimlane[]; warnings: string[] } {
	if (!spec) return { lanes: [ungroupedLane(tasks)], warnings: [] };

	const { lanes, warnings } = groupInto(spec.groupBy, tasks, ctx);
	const nested = spec.nested;
	if (!nested) return { lanes, warnings };

	const nestedWarnings: string[] = [];
	const split = lanes.map((lane) => {
		const result = groupInto(nested, lane.tasks, ctx);
		nestedWarnings.push(...result.warnings);
		return { ...lane, children: result.lanes };
	});
	return { lanes: split, warnings: [...warnings, ...nestedWarnings] };
}

/** The single field a `group by …` instruction groups on, or null when it isn't a plain
 * `group by <field>` (e.g. `group by function`, or a malformed line). */
export function laneGroupField(groupByText: string): GroupField | null {
	const { instructions } = parseQuery(groupByText);
	const first = instructions[0];
	return first?.kind === 'group-by' ? first.field : null;
}

/**
 * Inverts a lane key back into the value a cross-lane drag should write. Only priority, tags, due
 * and scheduled invert unambiguously: status lanes group by display *name* rather than the writable
 * symbol, and path/folder/filename/heading are structural. Those return null, which the drop
 * controller turns into a rejected cross-lane drop while still allowing column moves within a lane.
 */
export function laneWriteValueFor(field: GroupField, laneKey: string): BucketWriteValue | null {
	switch (field) {
		case 'priority':
			return { kind: 'priority', value: laneKey };
		case 'tags':
			return { kind: 'tags', add: laneKey, removeOthers: [] };
		case 'due':
		case 'scheduled': {
			if (laneKey === '(no date)') return { kind: 'date', field, value: null };
			const parsed = moment(laneKey, 'YYYY-MM-DD', true);
			return parsed.isValid() ? { kind: 'date', field, value: parsed } : null;
		}
		default:
			return null;
	}
}
