import type { Task } from '../types/tasks';
import type { LaneSpec } from '../types/board';
import { compileQuery } from '../query/compile';
import type { QueryContext } from '../query/context';

export interface Lane {
	id: string;
	label: string;
	tasks: Task[];
	nested: Lane[] | null;
}

const UNGROUPED_LANE_ID = '__all__';

function groupByInstruction(
	groupByText: string,
	tasks: readonly Task[],
	ctx: QueryContext,
): { lanes: Lane[]; warnings: string[] } {
	const compiled = compileQuery(groupByText);
	const warnings = compiled.errors.map((e) => e.message);
	if (!compiled.group) {
		return { lanes: [{ id: UNGROUPED_LANE_ID, label: '', tasks: [...tasks], nested: null }], warnings };
	}

	const buckets = new Map<string, Task[]>();
	for (const task of tasks) {
		const keys = compiled.group(task, ctx);
		// A task whose group function returns multiple keys appears in each lane — the one
		// place cards duplicate, matching Tasks' own behaviour (§10).
		const targetKeys = keys.length > 0 ? keys : ['(none)'];
		for (const key of targetKeys) {
			if (!buckets.has(key)) buckets.set(key, []);
			buckets.get(key)!.push(task);
		}
	}

	let keys = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
	if (compiled.groupReverse) keys = keys.reverse();

	const lanes = keys.map((key) => ({ id: key, label: key, tasks: buckets.get(key)!, nested: null as Lane[] | null }));
	return { lanes, warnings };
}

/**
 * Groups tasks into swimlanes (and, at most, one nested level) per LaneSpec. A null spec yields
 * a single ungrouped lane, so the board/lane rendering path is uniform whether or not lanes are
 * configured.
 */
export function buildLanes(
	spec: LaneSpec | null,
	tasks: readonly Task[],
	ctx: QueryContext,
): { lanes: Lane[]; warnings: string[] } {
	if (!spec) {
		return { lanes: [{ id: UNGROUPED_LANE_ID, label: '', tasks: [...tasks], nested: null }], warnings: [] };
	}

	const { lanes: topLanes, warnings } = groupByInstruction(spec.groupBy, tasks, ctx);
	if (!spec.nested) return { lanes: topLanes, warnings };

	const nestedWarnings: string[] = [];
	const lanes = topLanes.map((lane) => {
		const { lanes: nested, warnings: w } = groupByInstruction(spec.nested!, lane.tasks, ctx);
		nestedWarnings.push(...w);
		return { ...lane, nested };
	});
	return { lanes, warnings: [...warnings, ...nestedWarnings] };
}
