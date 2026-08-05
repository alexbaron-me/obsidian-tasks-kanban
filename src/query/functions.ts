import type { Task } from '../types/tasks';
import type { QueryContext } from './context';

/**
 * Compiles and evaluates `filter by function` / `sort by function` / `group by function`
 * expressions. No sandbox — same trust model as the Tasks plugin itself: functions in a
 * `.board` file execute with full plugin privileges.
 */

const compiledCache = new Map<string, (task: Task, query: QueryContext) => unknown>();

export class FunctionError extends Error {}

function getCompiled(expr: string): (task: Task, query: QueryContext) => unknown {
	let fn = compiledCache.get(expr);
	if (!fn) {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		fn = new Function('task', 'query', `"use strict"; return (${expr});`) as (
			task: Task,
			query: QueryContext,
		) => unknown;
		compiledCache.set(expr, fn);
	}
	return fn;
}

/** Records the first error per expression per render pass, so a broken expression against a
 * large task set never floods anything more than once. */
export class FunctionErrorSink {
	private reported = new Set<string>();

	report(expr: string, error: unknown): string | null {
		if (this.reported.has(expr)) return null;
		this.reported.add(expr);
		const message = error instanceof Error ? error.message : String(error);
		return message;
	}

	reset(): void {
		this.reported.clear();
	}
}

export function evalFilterFunction(
	expr: string,
	task: Task,
	ctx: QueryContext,
	sink: FunctionErrorSink,
): boolean {
	try {
		return Boolean(getCompiled(expr)(task, ctx));
	} catch (err) {
		sink.report(expr, err);
		return false;
	}
}

export function evalSortFunction(
	expr: string,
	task: Task,
	ctx: QueryContext,
	sink: FunctionErrorSink,
): number | string {
	try {
		const result = getCompiled(expr)(task, ctx);
		if (typeof result === 'number' || typeof result === 'string') return result;
		return 0;
	} catch (err) {
		sink.report(expr, err);
		return 0;
	}
}

export function evalGroupFunction(
	expr: string,
	task: Task,
	ctx: QueryContext,
	sink: FunctionErrorSink,
): string[] {
	try {
		const result = getCompiled(expr)(task, ctx);
		if (Array.isArray(result)) return result.map(String);
		if (typeof result === 'string') return [result];
		return [];
	} catch (err) {
		sink.report(expr, err);
		return [];
	}
}
