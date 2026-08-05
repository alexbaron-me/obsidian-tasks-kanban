import type { Task } from '../types/tasks';
import type { OrderOverride } from '../types/board';

/**
 * Applies sparse anchor-based order overrides to an already-sorted task list. An override whose
 * card or anchor is no longer present is silently dropped (this is the entire GC story — see
 * `pruneOrder` for persisting that drop back to the .board file).
 */
export function applyOrder(sortedTasks: readonly Task[], overrides: readonly OrderOverride[]): Task[] {
	const list = [...sortedTasks];

	for (const ov of overrides) {
		const cardIdx = list.findIndex((t) => t.id === ov.id);
		if (cardIdx === -1) continue;

		if ('first' in ov) {
			const [card] = list.splice(cardIdx, 1);
			list.unshift(card!);
			continue;
		}
		if ('last' in ov) {
			const [card] = list.splice(cardIdx, 1);
			list.push(card!);
			continue;
		}

		const anchorId = 'before' in ov ? ov.before : ov.after;
		const anchorIdx = list.findIndex((t) => t.id === anchorId);
		if (anchorIdx === -1 || anchorIdx === cardIdx) continue;

		const [card] = list.splice(cardIdx, 1);
		const newAnchorIdx = list.findIndex((t) => t.id === anchorId);
		const insertAt = 'before' in ov ? newAnchorIdx : newAnchorIdx + 1;
		list.splice(insertAt, 0, card!);
	}

	return list;
}

/**
 * Drops overrides whose card id or anchor id is no longer among `validIds` — tasks absent from
 * the cache, and (per §9) tasks hidden by auto-hide. Call this before persisting a bucket's
 * order list back to the .board file; there is no separate sweep pass.
 */
export function pruneOrder(overrides: readonly OrderOverride[], validIds: ReadonlySet<string>): OrderOverride[] {
	return overrides.filter((ov) => {
		if (!validIds.has(ov.id)) return false;
		if ('before' in ov) return validIds.has(ov.before);
		if ('after' in ov) return validIds.has(ov.after);
		return true;
	});
}

/**
 * Computes the override to record for a card dropped at `draggedIndex` in `orderedTasksAfterDrop`
 * (the bucket's task list, already including the dragged card at its new position). Prefers
 * `before: <next id>`, walking forward past neighbours that don't have an id yet; falls back to
 * `after: <previous id>` walking backward; falls back to `last: true` for an otherwise-empty
 * bucket. The dragged card must already have an id (see write/ids.ts) — callers are responsible
 * for assigning one before calling this.
 */
export function recordOrder(orderedTasksAfterDrop: readonly Task[], draggedIndex: number): OrderOverride {
	const draggedId = orderedTasksAfterDrop[draggedIndex]?.id ?? '';

	for (let i = draggedIndex + 1; i < orderedTasksAfterDrop.length; i++) {
		const id = orderedTasksAfterDrop[i]!.id;
		if (id) return { id: draggedId, before: id };
	}
	for (let i = draggedIndex - 1; i >= 0; i--) {
		const id = orderedTasksAfterDrop[i]!.id;
		if (id) return { id: draggedId, after: id };
	}
	return { id: draggedId, last: true };
}

export interface DropPositionResult {
	/** `bucketTasks` with `task` removed and reinserted at its dropped position. */
	newOrder: Task[];
	/** Index of `task` within `newOrder`. */
	insertAt: number;
	/** True when the drop landed back exactly where the card already was — same bucket, same
	 * position — so nothing actually changed. Callers should treat this as a full no-op: no
	 * write, no id assignment, no manual-order confirmation prompt (only a genuine reorder
	 * should ever trigger those). */
	isNoOp: boolean;
}

/**
 * Computes where `task` lands within `bucketTasks` (that bucket's current, pre-drop order) given
 * a drop that should insert it immediately before `insertBeforeTask` (or at the end, when null).
 * Pass `sameBucket: false` when the drop crosses into a different bucket or lane — such a drop is
 * never a no-op, even if the resulting position looks unchanged, because a field write still has
 * to happen.
 */
export function computeDropPosition(
	bucketTasks: readonly Task[],
	task: Task,
	insertBeforeTask: Task | null,
	sameBucket: boolean,
): DropPositionResult {
	const without = bucketTasks.filter((t) => t !== task);
	const rawInsertAt = insertBeforeTask ? without.indexOf(insertBeforeTask) : -1;
	const insertAt = rawInsertAt === -1 ? without.length : rawInsertAt;
	const newOrder = [...without];
	newOrder.splice(insertAt, 0, task);

	const isNoOp = sameBucket && newOrder.length === bucketTasks.length && newOrder.every((t, i) => t === bucketTasks[i]);

	return { newOrder, insertAt, isNoOp };
}
