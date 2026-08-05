import type { Moment } from 'moment';

/** A Tasks date wrapper. `.moment` is null when the field is absent. */
export interface TasksDate {
	moment: Moment | null;
}

export interface TasksFile {
	path: string;
	root: string;
	folder: string;
	filename: string;
	filenameWithoutExtension: string;
	/** Frontmatter of the containing note; may be an empty object. */
	frontmatter: Record<string, unknown>;
}

/** "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED" | "NON_TASK" */
export type StatusType = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | 'NON_TASK';

export interface TaskStatus {
	symbol: string;
	name: string;
	type: StatusType;
	nextStatusSymbol: string;
}

/**
 * A real Tasks `Task` class instance, as emitted by the Tasks plugin cache.
 * We never construct one; we declare only the surface we consume.
 */
export interface Task {
	status: TaskStatus;
	description: string;
	/** Tag strings including the leading '#'. */
	tags: string[];
	/** Tasks' internal scale: 0 highest .. 5 lowest. */
	priority: string;
	priorityName: string;
	priorityNumber: number;
	due: TasksDate;
	scheduled: TasksDate;
	start: TasksDate;
	created: TasksDate;
	done: TasksDate;
	cancelled: TasksDate;
	happens: TasksDate;
	/** Never null in practice when set — `unknown` already covers the absent (null) case. */
	recurrence: unknown;
	isRecurring: boolean;
	/** Empty string when the user has not set the id field. */
	id: string;
	dependsOn: string[];
	/** Computed getter — memoise per render pass. */
	urgency: number;
	file: TasksFile;
	taskLocation: { path: string; lineNumber: number };
	/** Exact source line, including list marker and indentation. The write guard. */
	originalMarkdown: string;
	/** Indented checklist children, if any. */
	children: Task[];
	/** Nearest preceding heading, or null. */
	precedingHeader: string | null;
}

export const PRIORITY_NAMES = ['highest', 'high', 'medium', 'none', 'low', 'lowest'] as const;
export type PriorityName = (typeof PRIORITY_NAMES)[number];

/** Priority number scale used internally by Tasks: 0 highest .. 5 lowest, 3 = none. */
export const PRIORITY_NUMBER_BY_NAME: Record<PriorityName, number> = {
	highest: 0,
	high: 1,
	medium: 2,
	none: 3,
	low: 4,
	lowest: 5,
};

export const DEFAULT_STATUSES: TaskStatus[] = [
	{ symbol: ' ', name: 'Todo', type: 'TODO', nextStatusSymbol: 'x' },
	{ symbol: '/', name: 'In Progress', type: 'IN_PROGRESS', nextStatusSymbol: 'x' },
	{ symbol: 'x', name: 'Done', type: 'DONE', nextStatusSymbol: ' ' },
];
