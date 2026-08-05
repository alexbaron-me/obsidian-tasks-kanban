import type { Task } from '../types/tasks';
import type { AccentRule } from '../settings/GlobalSettings';
import { compileQuery } from '../query/compile';
import type { QueryContext } from '../query/context';

export interface CompiledAccentRule {
	rule: AccentRule;
	matches: (task: Task, ctx: QueryContext) => boolean;
}

/** Compiles accent rules once per settings change — never per card (§11.4). */
export function compileAccentRules(rules: readonly AccentRule[]): CompiledAccentRule[] {
	return rules.map((rule) => ({ rule, matches: compileQuery(rule.filter).filter }));
}

/** First match wins. Returns null (no accent) if nothing matches or accents are disabled for
 * this board. */
export function matchAccent(
	compiled: readonly CompiledAccentRule[],
	task: Task,
	ctx: QueryContext,
): AccentRule | null {
	for (const c of compiled) {
		if (c.matches(task, ctx)) return c.rule;
	}
	return null;
}
