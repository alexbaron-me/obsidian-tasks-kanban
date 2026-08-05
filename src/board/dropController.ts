import type { Task, TaskStatus, PriorityName } from '../types/tasks';
import type { BucketWriteValue } from '../types/board';
import { FieldWriter } from '../write/FieldWriter';
import { TaskWriter, type WriteResult } from '../write/TaskWriter';

export interface WipState {
	countAfterMove: number;
	max: number;
	mode: 'soft' | 'hard';
}

export interface DropParams {
	task: Task;
	/** The bucket's writeValue. null means "reject" (read-only field, or a bucket like overdue/later with nothing to write). */
	columnWriteValue: BucketWriteValue | null;
	/** Present only for a cross-lane drag: the inverted lane writeValue, or null if the lane
	 * field isn't writable (in which case the drop is rejected outright). Omit entirely for a
	 * within-lane column move. */
	laneWriteValue?: BucketWriteValue | null;
	isBlocked: boolean;
	blockedDropMode: 'soft' | 'hard';
	wip?: WipState | null;
	resolveStatus: (symbol: string) => TaskStatus | null;
}

export interface DropDecision {
	ok: boolean;
	reason?: string;
	proceedWithWarning?: string;
}

function doneStatusFor(value: BucketWriteValue | null, resolveStatus: DropParams['resolveStatus']): TaskStatus | null {
	if (!value || value.kind !== 'status') return null;
	const status = resolveStatus(value.symbol);
	if (status && (status.type === 'DONE' || status.type === 'CANCELLED')) return status;
	return null;
}

/** Pure decision logic for a drop: whether it's allowed, rejected, or allowed-with-a-warning. */
export function decideDrop(params: DropParams): DropDecision {
	if (params.columnWriteValue === null) {
		return { ok: false, reason: 'This column has no field to set — the drop was ignored.' };
	}
	if (params.laneWriteValue === null) {
		return { ok: false, reason: 'This lane cannot be changed by dragging.' };
	}

	const doneStatus = doneStatusFor(params.columnWriteValue, params.resolveStatus);
	if (doneStatus && params.isBlocked) {
		if (params.blockedDropMode === 'hard') {
			return { ok: false, reason: 'This task is blocked by an unfinished dependency.' };
		}
		return { ok: true, proceedWithWarning: 'Completing a task that is still blocked.' };
	}

	if (params.wip && params.wip.countAfterMove > params.wip.max) {
		if (params.wip.mode === 'hard') return { ok: false, reason: 'This column is at its WIP limit.' };
		return { ok: true, proceedWithWarning: 'Over the WIP limit.' };
	}

	return { ok: true };
}

export function fieldWriterTransform(fieldWriter: FieldWriter, value: BucketWriteValue): (line: string) => string {
	switch (value.kind) {
		case 'status':
			return (line) => fieldWriter.setStatusSymbol(line, value.symbol);
		case 'date':
			return (line) => fieldWriter.setDate(line, value.field, value.value);
		case 'priority':
			return (line) => fieldWriter.setPriority(line, value.value as PriorityName);
		case 'tags':
			return (line) => {
				let out = fieldWriter.addTag(line, value.add);
				for (const other of value.removeOthers) out = fieldWriter.removeTag(out, other);
				return out;
			};
	}
}

/**
 * Executes an already-decided drop. A DONE-type column write routes through
 * `TaskWriter.completeTask` (per §5.1); everything else — including a simultaneous cross-lane
 * field write — collapses into one guarded write via `TaskWriter.applyMany` (§10: "both
 * mutations apply in a single file write"). A DONE transition combined with a cross-lane write
 * is intentionally not composed into the API's return value — the API owns that line fully, and
 * a follow-up write against the now-stale `originalMarkdown` is safely guard-rejected rather
 * than silently dropped; the next cache refresh lets the user retry the lane move.
 */
export async function executeDrop(
	taskWriter: TaskWriter,
	fieldWriter: FieldWriter,
	params: DropParams,
): Promise<{ decision: DropDecision; result?: WriteResult }> {
	const decision = decideDrop(params);
	if (!decision.ok) return { decision };

	const doneStatus = doneStatusFor(params.columnWriteValue, params.resolveStatus);
	if (doneStatus) {
		const result = await taskWriter.setStatus(params.task, doneStatus);
		return { decision, result };
	}

	const values = [params.columnWriteValue, params.laneWriteValue].filter(
		(v): v is BucketWriteValue => v !== null && v !== undefined,
	);
	const transforms = values.map((v) => fieldWriterTransform(fieldWriter, v));
	const result = await taskWriter.applyMany(params.task, transforms);
	return { decision, result };
}
