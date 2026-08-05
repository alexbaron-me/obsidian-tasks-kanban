import type { Task } from '../types/tasks';
import { PRIORITY_NUMBER_BY_NAME, type PriorityName } from '../types/tasks';
import type { Instruction, QueryError, SortField, GroupField } from './parse';
import { parseQuery } from './parse';
import { compareDates, getDateField, parseQueryDate } from './dates';
import type { QueryContext } from './context';
import { evalFilterFunction, evalGroupFunction, evalSortFunction, FunctionErrorSink } from './functions';

export interface CompiledQuery {
	filter: (task: Task, ctx: QueryContext) => boolean;
	sort: ((a: Task, b: Task, ctx: QueryContext) => number) | null;
	group: ((task: Task, ctx: QueryContext) => string[]) | null;
	/** Whether lane ordering (natural order of group keys) should be reversed. Not meaningful
	 * for `group by function`, whose lane order is first-seen order. */
	groupReverse: boolean;
	errors: QueryError[];
}

function isBlocked(task: Task, ctx: QueryContext): boolean {
	if (task.dependsOn.length === 0) return false;
	return task.dependsOn.some((id) => {
		const blocker = ctx.allTasks.find((t) => t.id === id);
		return blocker !== undefined && blocker.status.type !== 'DONE' && blocker.status.type !== 'CANCELLED';
	});
}

function isBlocking(task: Task, ctx: QueryContext): boolean {
	if (task.id === '') return false;
	return ctx.allTasks.some(
		(t) => t.dependsOn.includes(task.id) && t.status.type !== 'DONE' && t.status.type !== 'CANCELLED',
	);
}

function textOf(task: Task, field: 'description' | 'path' | 'folder' | 'filename' | 'heading'): string {
	switch (field) {
		case 'description':
			return task.description;
		case 'path':
			return task.file.path;
		case 'folder':
			return task.file.folder;
		case 'filename':
			return task.file.filename;
		case 'heading':
			return task.precedingHeader ?? '';
	}
}

function comparePriorityMod(task: Task, mod: 'above' | 'below' | 'not' | null, value: PriorityName): boolean {
	const threshold = PRIORITY_NUMBER_BY_NAME[value];
	if (mod === null) return task.priorityName === value;
	if (mod === 'not') return task.priorityName !== value;
	if (mod === 'above') return task.priorityNumber < threshold;
	return task.priorityNumber > threshold; // below
}

/** Builds a filter closure for a single (possibly boolean-composite) instruction. Throws for
 * instruction kinds that cannot be used as a filter (sort/group directives). */
function compileFilterNode(
	instr: Instruction,
	sink: FunctionErrorSink,
): (task: Task, ctx: QueryContext) => boolean {
	switch (instr.kind) {
		case 'status-done':
			return (task) => {
				const isDone = task.status.type === 'DONE' || task.status.type === 'CANCELLED';
				return instr.negate ? !isDone : isDone;
			};
		case 'status-type':
			return (task) => task.status.type === instr.value;
		case 'status-name-includes':
			return (task) => task.status.name.toLowerCase().includes(instr.text.toLowerCase());
		case 'has-date':
			return (task) => {
				const has = getDateField(task, instr.field).moment !== null;
				return instr.has ? has : !has;
			};
		case 'date-compare':
			return (task, ctx) => {
				const target = parseQueryDate(instr.dateText, ctx.today);
				const actual = getDateField(task, instr.field).moment;
				if (target === null || actual === null) return false;
				switch (instr.op) {
					case 'before':
						return actual.isBefore(target, 'day');
					case 'after':
						return actual.isAfter(target, 'day');
					case 'on':
						return actual.isSame(target, 'day');
					case 'on-or-before':
						return actual.isSameOrBefore(target, 'day');
					case 'on-or-after':
						return actual.isSameOrAfter(target, 'day');
				}
			};
		case 'date-range':
			return (task, ctx) => {
				const from = parseQueryDate(instr.fromText, ctx.today);
				const to = parseQueryDate(instr.toText, ctx.today);
				const actual = getDateField(task, instr.field).moment;
				if (from === null || to === null || actual === null) return false;
				return actual.isSameOrAfter(from, 'day') && actual.isSameOrBefore(to, 'day');
			};
		case 'priority':
			return (task) => comparePriorityMod(task, instr.mod, instr.value);
		case 'text-match':
			return (task) => {
				const haystack = textOf(task, instr.field).toLowerCase();
				const contains = haystack.includes(instr.text.toLowerCase());
				return instr.includes ? contains : !contains;
			};
		case 'regex-match': {
			let re: RegExp | null = null;
			let compileError: string | null = null;
			try {
				re = new RegExp(instr.pattern, instr.flags);
			} catch (err) {
				compileError = err instanceof Error ? err.message : String(err);
			}
			return (task) => {
				if (compileError !== null || re === null) return false;
				return re.test(task.description);
			};
		}
		case 'tag-match':
			return (task) => {
				const target = instr.tag.toLowerCase();
				const contains = task.tags.some((t) => t.toLowerCase().includes(target));
				return instr.includes ? contains : !contains;
			};
		case 'recurring':
			return (task) => (instr.negate ? !task.isRecurring : task.isRecurring);
		case 'blocked':
			return (task, ctx) => {
				const blocked = isBlocked(task, ctx);
				return instr.negate ? !blocked : blocked;
			};
		case 'blocking':
			return (task, ctx) => {
				const blocking = isBlocking(task, ctx);
				return instr.negate ? !blocking : blocking;
			};
		case 'filter-function':
			return (task, ctx) => evalFilterFunction(instr.expr, task, ctx, sink);
		case 'and': {
			const left = compileFilterNode(instr.left, sink);
			const right = compileFilterNode(instr.right, sink);
			return (task, ctx) => left(task, ctx) && right(task, ctx);
		}
		case 'or': {
			const left = compileFilterNode(instr.left, sink);
			const right = compileFilterNode(instr.right, sink);
			return (task, ctx) => left(task, ctx) || right(task, ctx);
		}
		case 'xor': {
			const left = compileFilterNode(instr.left, sink);
			const right = compileFilterNode(instr.right, sink);
			return (task, ctx) => left(task, ctx) !== right(task, ctx);
		}
		case 'not': {
			const operand = compileFilterNode(instr.operand, sink);
			return (task, ctx) => !operand(task, ctx);
		}
		case 'sort-function':
		case 'group-function':
		case 'sort-by':
		case 'group-by':
			throw new Error(`"${instr.kind}" cannot be used as a filter`);
	}
}

function compareBySortField(field: SortField, a: Task, b: Task): number {
	switch (field) {
		case 'due':
		case 'scheduled':
		case 'start':
		case 'created':
		case 'done':
			return compareDates(getDateField(a, field).moment, getDateField(b, field).moment);
		case 'priority':
			return a.priorityNumber - b.priorityNumber;
		case 'urgency':
			return a.urgency - b.urgency;
		case 'description':
			return a.description.localeCompare(b.description);
		case 'path':
			return a.file.path.localeCompare(b.file.path);
		case 'status':
			return a.status.name.localeCompare(b.status.name);
	}
}

function groupKeysForField(field: GroupField, task: Task): string[] {
	switch (field) {
		case 'status':
			return [task.status.name];
		case 'status.name':
			return [task.status.name];
		case 'status.type':
			return [task.status.type];
		case 'priority':
			return [task.priorityName];
		case 'tags':
			return task.tags.length > 0 ? task.tags : ['(no tags)'];
		case 'path':
			return [task.file.path];
		case 'folder':
			return [task.file.folder || '(root)'];
		case 'filename':
			return [task.file.filename];
		case 'heading':
			return [task.precedingHeader ?? '(no heading)'];
		case 'due':
		case 'scheduled':
		case 'happens': {
			const m = getDateField(task, field).moment;
			return [m ? m.format('YYYY-MM-DD') : '(no date)'];
		}
	}
}

export interface CompileOptions {
	sink?: FunctionErrorSink;
}

/** Compiles raw query text into filter/sort/group closures. Tolerant: unrecognised lines are
 * recorded in `errors` and simply do not contribute a clause. */
export function compileQuery(source: string, options: CompileOptions = {}): CompiledQuery {
	const { instructions, errors } = parseQuery(source);
	const sink = options.sink ?? new FunctionErrorSink();

	const filterNodes: ((task: Task, ctx: QueryContext) => boolean)[] = [];
	const sortFields: { field: SortField; reverse: boolean }[] = [];
	const sortFunctions: { expr: string }[] = [];
	let groupField: { field: GroupField; reverse: boolean } | null = null;
	let groupFunction: string | null = null;

	for (const instr of instructions) {
		try {
			if (instr.kind === 'sort-by') {
				sortFields.push({ field: instr.field, reverse: instr.reverse });
			} else if (instr.kind === 'sort-function') {
				sortFunctions.push({ expr: instr.expr });
			} else if (instr.kind === 'group-by') {
				groupField = { field: instr.field, reverse: instr.reverse };
			} else if (instr.kind === 'group-function') {
				groupFunction = instr.expr;
			} else {
				filterNodes.push(compileFilterNode(instr, sink));
			}
		} catch (err) {
			errors.push({ line: -1, message: err instanceof Error ? err.message : String(err) });
		}
	}

	const filter = (task: Task, ctx: QueryContext): boolean => filterNodes.every((fn) => fn(task, ctx));

	let sort: CompiledQuery['sort'] = null;
	if (sortFunctions.length > 0) {
		const exprs = sortFunctions.map((s) => s.expr);
		sort = (a, b, ctx) => {
			for (const expr of exprs) {
				const av = evalSortFunction(expr, a, ctx, sink);
				const bv = evalSortFunction(expr, b, ctx, sink);
				if (av < bv) return -1;
				if (av > bv) return 1;
			}
			return 0;
		};
	} else if (sortFields.length > 0) {
		sort = (a, b) => {
			for (const { field, reverse } of sortFields) {
				const cmp = compareBySortField(field, a, b);
				if (cmp !== 0) return reverse ? -cmp : cmp;
			}
			return 0;
		};
	}

	let group: CompiledQuery['group'] = null;
	if (groupFunction !== null) {
		const expr = groupFunction;
		group = (task, ctx) => evalGroupFunction(expr, task, ctx, sink);
	} else if (groupField !== null) {
		const { field } = groupField;
		group = (task) => groupKeysForField(field, task);
	}

	return { filter, sort, group, groupReverse: groupField?.reverse ?? false, errors };
}
