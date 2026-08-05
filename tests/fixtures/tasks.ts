import moment from 'moment';
import type { Task, TaskStatus, TasksDate, TasksFile } from '../../src/types/tasks';
import { DEFAULT_STATUSES, PRIORITY_NUMBER_BY_NAME } from '../../src/types/tasks';

function tdate(value: string | null): TasksDate {
	return { moment: value ? moment(value) : null };
}

const EXTRA_STATUSES: TaskStatus[] = [
	{ symbol: '-', name: 'Cancelled', type: 'CANCELLED', nextStatusSymbol: ' ' },
];

function statusFor(symbol: string): TaskStatus {
	return (
		DEFAULT_STATUSES.find((s) => s.symbol === symbol) ??
		EXTRA_STATUSES.find((s) => s.symbol === symbol) ??
		DEFAULT_STATUSES[0]!
	);
}

let autoLine = 0;

export interface TaskOverrides {
	description?: string;
	status?: string; // symbol
	tags?: string[];
	priorityName?: keyof typeof PRIORITY_NUMBER_BY_NAME;
	due?: string | null;
	scheduled?: string | null;
	start?: string | null;
	created?: string | null;
	done?: string | null;
	cancelled?: string | null;
	id?: string;
	dependsOn?: string[];
	path?: string;
	lineNumber?: number;
	children?: Task[];
	precedingHeader?: string | null;
	isRecurring?: boolean;
	recurrence?: unknown;
	urgency?: number;
}

const PRIORITY_ICON: Record<string, string> = {
	highest: '🔺',
	high: '⏫',
	medium: '🔼',
	low: '🔽',
	lowest: '⏬',
	none: '',
};

export function makeTask(overrides: TaskOverrides = {}): Task {
	const priorityName = overrides.priorityName ?? 'none';
	const status = statusFor(overrides.status ?? ' ');
	const path = overrides.path ?? 'Inbox.md';
	const lineNumber = overrides.lineNumber ?? autoLine++;
	const description = overrides.description ?? 'Sample task';

	const file: TasksFile = {
		path,
		root: '/',
		folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
		filename: path.split('/').pop() ?? path,
		filenameWithoutExtension: (path.split('/').pop() ?? path).replace(/\.md$/, ''),
		frontmatter: {},
	};

	const idPart = overrides.id ? ` 🆔 ${overrides.id}` : '';
	const dueMd = overrides.due ? ` 📅 ${overrides.due}` : '';
	const priorityMd = priorityName !== 'none' ? ` ${PRIORITY_ICON[priorityName]}` : '';
	const tagsMd = overrides.tags?.length ? ` ${overrides.tags.join(' ')}` : '';
	const originalMarkdown = `- [${status.symbol}] ${description}${tagsMd}${priorityMd}${dueMd}${idPart}`;

	return {
		status,
		description,
		tags: overrides.tags ?? [],
		priority: String(PRIORITY_NUMBER_BY_NAME[priorityName]),
		priorityName,
		priorityNumber: PRIORITY_NUMBER_BY_NAME[priorityName],
		due: tdate(overrides.due ?? null),
		scheduled: tdate(overrides.scheduled ?? null),
		start: tdate(overrides.start ?? null),
		created: tdate(overrides.created ?? null),
		done: tdate(overrides.done ?? null),
		cancelled: tdate(overrides.cancelled ?? null),
		happens: tdate(overrides.due ?? overrides.scheduled ?? overrides.start ?? null),
		recurrence: overrides.recurrence ?? null,
		isRecurring: overrides.isRecurring ?? false,
		id: overrides.id ?? '',
		dependsOn: overrides.dependsOn ?? [],
		urgency: overrides.urgency ?? 0,
		file,
		taskLocation: { path, lineNumber },
		originalMarkdown,
		children: overrides.children ?? [],
		precedingHeader: overrides.precedingHeader ?? null,
	};
}

export function todayStr(offsetDays = 0): string {
	return moment().add(offsetDays, 'day').format('YYYY-MM-DD');
}

/** A representative fixture set covering the shapes named in spec §17. */
export function makeFixtureSet(): Record<string, Task> {
	const blocker = makeTask({ description: 'Blocker task', id: 'block1', status: ' ' });
	const blockerDone = makeTask({ description: 'Finished blocker', id: 'block2', status: 'x', done: todayStr(-1) });

	return {
		plain: makeTask({ description: 'Plain task' }),
		recurring: makeTask({
			description: 'Water plants 🔁 every week',
			isRecurring: true,
			recurrence: { text: 'every week' },
			due: todayStr(1),
		}),
		blocked: makeTask({
			description: 'Blocked task',
			dependsOn: [blocker.id],
		}),
		unblocked: makeTask({
			description: 'Unblocked task',
			dependsOn: [blockerDone.id],
		}),
		blocking: blocker,
		blockerDone,
		undated: makeTask({ description: 'Undated task' }),
		overdue: makeTask({ description: 'Overdue task', due: todayStr(-5) }),
		multiTag: makeTask({ description: 'Multi tag task', tags: ['#work', '#urgent', '#home'] }),
		withChildren: makeTask({
			description: 'Parent task',
			children: [
				makeTask({ description: 'Child 1', status: 'x', done: todayStr() }),
				makeTask({ description: 'Child 2' }),
			],
		}),
		done: makeTask({ description: 'Done task', status: 'x', done: todayStr(-20) }),
		cancelled: makeTask({ description: 'Cancelled task', status: '-', cancelled: todayStr(-20) }),
	};
}
