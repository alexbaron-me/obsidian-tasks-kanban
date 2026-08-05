import type { Moment } from 'moment';
import type { Task } from '../types/tasks';
import type { ChipKind } from '../types/board';
import type { QueryContext } from '../query/context';

export interface ChipData {
	kind: ChipKind;
	label: string;
	icon: string;
	variant: 'overdue' | 'normal';
	/** Present only on `tags` chips, one per tag, so the UI can render a pill per tag and wire
	 * per-tag click-to-filter (§11.3). */
	tag?: string;
}

const DATE_ICON: Record<'due' | 'scheduled' | 'start', string> = { due: '📅', scheduled: '⏳', start: '🛫' };
const PRIORITY_ICON: Record<string, string> = { highest: '🔺', high: '⏫', medium: '🔼', low: '🔽', lowest: '⏬' };

function relativeDateLabel(m: Moment, today: Moment): string {
	const days = m.clone().startOf('day').diff(today.clone().startOf('day'), 'day');
	if (days === 0) return 'today';
	if (days === 1) return 'tomorrow';
	if (days === -1) return 'yesterday';
	if (days > 1) return `in ${days}d`;
	return `${Math.abs(days)}d ago`;
}

function unmetBlockerCount(task: Task, allTasks: readonly Task[]): number {
	return task.dependsOn.filter((id) => {
		const blocker = allTasks.find((t) => t.id === id);
		return blocker !== undefined && blocker.status.type !== 'DONE' && blocker.status.type !== 'CANCELLED';
	}).length;
}

/** Builds the chip list for a card, in the configured order. Chips whose data doesn't apply to
 * this task (no date set, no priority, no children, …) are simply omitted. */
export function buildChips(kinds: readonly ChipKind[], task: Task, ctx: QueryContext): ChipData[] {
	const chips: ChipData[] = [];
	for (const kind of kinds) {
		switch (kind) {
			case 'due':
			case 'scheduled':
			case 'start': {
				const m = task[kind].moment;
				if (!m) continue;
				const overdue = kind === 'due' && m.clone().startOf('day').isBefore(ctx.today.clone().startOf('day'));
				chips.push({ kind, label: relativeDateLabel(m, ctx.today), icon: DATE_ICON[kind], variant: overdue ? 'overdue' : 'normal' });
				continue;
			}
			case 'priority':
				if (task.priorityName !== 'none') {
					chips.push({ kind, label: task.priorityName, icon: PRIORITY_ICON[task.priorityName] ?? '', variant: 'normal' });
				}
				continue;
			case 'tags':
				for (const tag of task.tags) chips.push({ kind, label: tag, icon: '', variant: 'normal', tag });
				continue;
			case 'path':
				chips.push({ kind, label: task.file.filename, icon: '📄', variant: 'normal' });
				continue;
			case 'recurrence':
				if (task.isRecurring) chips.push({ kind, label: 'recurring', icon: '🔁', variant: 'normal' });
				continue;
			case 'urgency':
				chips.push({ kind, label: task.urgency.toFixed(2), icon: '', variant: 'normal' });
				continue;
			case 'dependency': {
				const unmet = unmetBlockerCount(task, ctx.allTasks);
				if (unmet > 0) chips.push({ kind, label: String(unmet), icon: '⛔', variant: 'normal' });
				continue;
			}
			case 'children':
				if (task.children.length > 0) {
					const done = task.children.filter((c) => c.status.type === 'DONE').length;
					chips.push({ kind, label: `${done}/${task.children.length}`, icon: '☑', variant: 'normal' });
				}
				continue;
		}
	}
	return chips;
}

export function isBlockedDimmed(task: Task, allTasks: readonly Task[]): boolean {
	return unmetBlockerCount(task, allTasks) > 0;
}
