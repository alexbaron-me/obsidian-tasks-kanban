import type { Moment } from 'moment';
import type { Task } from '../types/tasks';
import type { BoardFile, Bucket, ViewConfig } from '../types/board';
import { compileQuery } from '../query/compile';
import type { QueryContext } from '../query/context';
import { generateBuckets } from './buckets';
import { buildSwimlanes, type Swimlane } from './swimlanes';
import { applyOrder, pruneOrder } from './order';
import { applyAutoHide } from './autoHide';
import type { ResolvedSettings } from '../settings/cascade';

export interface RenderedColumn {
	bucket: Bucket;
	tasks: Task[];
}

export interface RenderedLane {
	id: string;
	label: string;
	columns: RenderedColumn[];
	/** Mirrors `Swimlane.children`: non-null only for a lane the nested `group by` split. */
	children: RenderedLane[] | null;
}

export interface BoardData {
	lanes: RenderedLane[];
	hiddenCount: number;
	warnings: string[];
	prunedOrder: Record<string, ReturnType<typeof pruneOrder>>;
}

const DEFAULT_SORT = 'sort by urgency reverse';

function sortBucketTasks(tasks: Task[], sortText: string, ctx: QueryContext): Task[] {
	const compiled = compileQuery(sortText || DEFAULT_SORT);
	const sorter = compiled.sort ?? compileQuery(DEFAULT_SORT).sort!;
	return [...tasks].sort((a, b) => sorter(a, b, ctx));
}

function bucketizeLaneTasks(
	laneTasks: Task[],
	view: ViewConfig,
	ctx: QueryContext,
	warnings: string[],
): { columns: RenderedColumn[]; hidden: Task[]; order: Record<string, ReturnType<typeof pruneOrder>> } {
	const { buckets, assignment, hidden, warnings: bucketWarnings } = generateBuckets(
		view.columns,
		laneTasks,
		ctx.today,
	);
	warnings.push(...bucketWarnings);

	const order: Record<string, ReturnType<typeof pruneOrder>> = {};
	const columns: RenderedColumn[] = buckets.map((bucket) => {
		const raw = assignment.get(bucket.id) ?? [];
		const sortText = bucket.override.sort || view.sort || DEFAULT_SORT;
		const sorted = sortBucketTasks(raw, sortText, ctx);

		const validIds = new Set(sorted.map((t) => t.id).filter((id) => id !== ''));
		const overrides = pruneOrder(view.order[bucket.id] ?? [], validIds);
		order[bucket.id] = overrides;
		const ordered = applyOrder(sorted, overrides);

		return { bucket, tasks: ordered };
	});

	return { columns, hidden, order };
}

function renderLanes(lanes: Swimlane[], view: ViewConfig, ctx: QueryContext, warnings: string[]): {
	rendered: RenderedLane[];
	hidden: Task[];
	order: Record<string, ReturnType<typeof pruneOrder>>;
} {
	let hidden: Task[] = [];
	let order: Record<string, ReturnType<typeof pruneOrder>> = {};
	const rendered = lanes.map((lane): RenderedLane => {
		const { columns, hidden: laneHidden, order: laneOrder } = bucketizeLaneTasks(lane.tasks, view, ctx, warnings);
		hidden = hidden.concat(laneHidden);
		order = { ...order, ...laneOrder };
		let children: RenderedLane[] | null = null;
		if (lane.children) {
			const nested = renderLanes(lane.children, view, ctx, warnings);
			children = nested.rendered;
			hidden = hidden.concat(nested.hidden);
			order = { ...order, ...nested.order };
		}
		return { id: lane.id, label: lane.label, columns, children };
	});
	return { rendered, hidden, order };
}

/**
 * The full read pipeline for one view: compose filters (board AND view), filter, auto-hide,
 * group into lanes, bucket into columns per lane, sort each bucket, then apply manual order
 * overrides (pruned against the tasks actually visible in that bucket).
 */
export function computeBoardData(
	board: BoardFile,
	view: ViewConfig,
	allTasks: readonly Task[],
	ctx: QueryContext,
	resolved: ResolvedSettings,
): BoardData {
	const warnings: string[] = [];
	const combinedFilterText = [board.filters, view.filters].filter((t) => t.trim() !== '').join('\n');
	const compiled = compileQuery(combinedFilterText);
	warnings.push(...compiled.errors.map((e) => `Filter error (line ${e.line}): ${e.message}`));

	const filtered = allTasks.filter((t) => compiled.filter(t, ctx));
	const visible = applyAutoHide(filtered, resolved.hideDoneAfterDays, ctx.today);

	const { lanes, warnings: laneWarnings } = buildSwimlanes(view.lanes, visible, ctx);
	warnings.push(...laneWarnings);

	const { rendered, hidden, order } = renderLanes(lanes, view, ctx, warnings);

	return { lanes: rendered, hiddenCount: hidden.length, warnings, prunedOrder: order };
}

export function freezeToday(momentFactory: () => Moment): Moment {
	return momentFactory().startOf('day');
}
