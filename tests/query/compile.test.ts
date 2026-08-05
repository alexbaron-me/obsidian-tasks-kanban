import { describe, expect, it } from 'vitest';
import moment from 'moment';
import { compileQuery } from '../../src/query/compile';
import type { QueryContext } from '../../src/query/context';
import { makeFixtureSet, makeTask, todayStr } from '../fixtures/tasks';
import type { Task } from '../../src/types/tasks';

function ctxFor(allTasks: Task[]): QueryContext {
	return {
		file: { path: 'board.md', root: '/', folder: '', filename: 'board.md', filenameWithoutExtension: 'board', frontmatter: {} },
		allTasks,
		boardId: 'board.md',
		viewName: 'Test',
		today: moment(todayStr()),
	};
}

function filterOne(source: string, task: Task, allTasks: Task[] = [task]): boolean {
	const compiled = compileQuery(source);
	expect(compiled.errors).toEqual([]);
	return compiled.filter(task, ctxFor(allTasks));
}

describe('filter evaluation', () => {
	it('done matches DONE and CANCELLED statuses', () => {
		const fx = makeFixtureSet();
		expect(filterOne('done', fx.done)).toBe(true);
		expect(filterOne('done', fx.cancelled)).toBe(true);
		expect(filterOne('done', fx.plain)).toBe(false);
	});

	it('not done excludes completed tasks', () => {
		const fx = makeFixtureSet();
		expect(filterOne('not done', fx.plain)).toBe(true);
		expect(filterOne('not done', fx.done)).toBe(false);
	});

	it('due before matches an overdue task', () => {
		const fx = makeFixtureSet();
		expect(filterOne('due before today', fx.overdue)).toBe(true);
	});

	it('has due date excludes undated tasks', () => {
		const fx = makeFixtureSet();
		expect(filterOne('has due date', fx.undated)).toBe(false);
		expect(filterOne('has due date', fx.overdue)).toBe(true);
	});

	it('no due date matches undated tasks', () => {
		const fx = makeFixtureSet();
		expect(filterOne('no due date', fx.undated)).toBe(true);
	});

	it('date range matches within an inclusive window', () => {
		const task = makeTask({ due: todayStr(2) });
		expect(filterOne('due in today ' + todayStr(5), task)).toBe(true);
		const outside = makeTask({ due: todayStr(10) });
		expect(filterOne('due in today ' + todayStr(5), outside)).toBe(false);
	});

	it('priority is matches exact priority', () => {
		const high = makeTask({ priorityName: 'high' });
		expect(filterOne('priority is high', high)).toBe(true);
		expect(filterOne('priority is low', high)).toBe(false);
	});

	it('priority is above matches strictly higher priority', () => {
		const highest = makeTask({ priorityName: 'highest' });
		const low = makeTask({ priorityName: 'low' });
		expect(filterOne('priority is above medium', highest)).toBe(true);
		expect(filterOne('priority is above medium', low)).toBe(false);
	});

	it('priority is below matches strictly lower priority', () => {
		const lowest = makeTask({ priorityName: 'lowest' });
		expect(filterOne('priority is below medium', lowest)).toBe(true);
	});

	it('priority is not excludes the given value', () => {
		const none = makeTask({ priorityName: 'none' });
		expect(filterOne('priority is not none', none)).toBe(false);
	});

	it('description includes is case-insensitive substring', () => {
		const task = makeTask({ description: 'Fix the Login Bug' });
		expect(filterOne('description includes login', task)).toBe(true);
		expect(filterOne('description does not include login', task)).toBe(false);
	});

	it('path/folder/filename filters read from task.file', () => {
		const task = makeTask({ description: 'x', path: 'Projects/Alpha/todo.md' });
		expect(filterOne('path includes Projects/Alpha', task)).toBe(true);
		expect(filterOne('folder includes Alpha', task)).toBe(true);
		expect(filterOne('filename includes todo', task)).toBe(true);
	});

	it('heading includes reads precedingHeader, tolerating a null heading', () => {
		const withHeading = makeTask({ description: 'x', precedingHeader: 'Backlog' });
		const withoutHeading = makeTask({ description: 'y', precedingHeader: null });
		expect(filterOne('heading includes Backlog', withHeading)).toBe(true);
		expect(filterOne('heading includes Backlog', withoutHeading)).toBe(false);
	});

	it('description regex matches applies the pattern and flags', () => {
		const task = makeTask({ description: 'Fix login bug' });
		expect(filterOne('description regex matches /^Fix.*bug$/i', task)).toBe(true);
		expect(filterOne('description regex matches /^FIX/', task)).toBe(false);
	});

	it('an invalid regex fails closed instead of throwing', () => {
		const task = makeTask({ description: 'x' });
		expect(() => filterOne('description regex matches /(unclosed/', task)).not.toThrow();
		expect(filterOne('description regex matches /(unclosed/', task)).toBe(false);
	});

	it('tag includes matches substring against any tag', () => {
		const fx = makeFixtureSet();
		expect(filterOne('tag includes work', fx.multiTag)).toBe(true);
		expect(filterOne('tags include urgent', fx.multiTag)).toBe(true);
		expect(filterOne('tag does not include missing', fx.multiTag)).toBe(true);
	});

	it('is recurring / is not recurring', () => {
		const fx = makeFixtureSet();
		expect(filterOne('is recurring', fx.recurring)).toBe(true);
		expect(filterOne('is not recurring', fx.plain)).toBe(true);
	});

	it('is blocked is true only when a listed blocker is not done', () => {
		const fx = makeFixtureSet();
		const all = Object.values(fx);
		expect(filterOne('is blocked', fx.blocked, all)).toBe(true);
		expect(filterOne('is blocked', fx.unblocked, all)).toBe(false);
		expect(filterOne('is not blocked', fx.unblocked, all)).toBe(true);
	});

	it('is blocking is true when another unmet task depends on this one', () => {
		const fx = makeFixtureSet();
		const all = Object.values(fx);
		expect(filterOne('is blocking', fx.blocking, all)).toBe(true);
		expect(filterOne('is not blocking', fx.plain, all)).toBe(true);
	});

	it('filter by function evaluates arbitrary JS against the task', () => {
		const task = makeTask({ description: 'x'.repeat(10) });
		expect(filterOne('filter by function task.description.length > 5', task)).toBe(true);
		expect(filterOne('filter by function task.description.length > 50', task)).toBe(false);
	});

	it('a throwing filter function yields false without throwing', () => {
		const task = makeTask();
		expect(filterOne('filter by function task.nonexistent.deeper', task)).toBe(false);
	});
});

describe('boolean composition', () => {
	it('AND requires both operands', () => {
		const task = makeTask({ status: 'x', done: todayStr(), priorityName: 'high' });
		expect(filterOne('(done) AND (priority is high)', task)).toBe(true);
		expect(filterOne('(done) AND (priority is low)', task)).toBe(false);
	});
	it('OR requires either operand', () => {
		const task = makeTask({ priorityName: 'high' });
		expect(filterOne('(done) OR (priority is high)', task)).toBe(true);
	});
	it('XOR requires exactly one operand', () => {
		const task = makeTask({ status: 'x', done: todayStr(), priorityName: 'high' });
		expect(filterOne('(done) XOR (priority is high)', task)).toBe(false);
		const other = makeTask({ priorityName: 'high' });
		expect(filterOne('(done) XOR (priority is high)', other)).toBe(true);
	});
	it('NOT inverts the operand', () => {
		const task = makeTask({ status: 'x', done: todayStr() });
		expect(filterOne('NOT (done)', task)).toBe(false);
	});
	it('supports arbitrary nesting', () => {
		const task = makeTask({ priorityName: 'high', tags: ['#work'] });
		expect(filterOne('((priority is high) AND (tag includes work)) OR (done)', task)).toBe(true);
	});
});

describe('multi-line queries AND together and tolerate bad lines', () => {
	it('ANDs every line', () => {
		const task = makeTask({ priorityName: 'high', tags: ['#work'] });
		expect(filterOne('priority is high\ntag includes work', task)).toBe(true);
		expect(filterOne('priority is high\ntag includes missing', task)).toBe(false);
	});
	it('a malformed line does not abort the rest of the query', () => {
		const task = makeTask({ priorityName: 'high' });
		const compiled = compileQuery('priority is high\nbogus nonsense line');
		expect(compiled.errors).toHaveLength(1);
		expect(compiled.filter(task, ctxFor([task]))).toBe(true);
	});
});

describe('sort', () => {
	it('sorts by due ascending by default', () => {
		const early = makeTask({ due: todayStr(1) });
		const late = makeTask({ due: todayStr(5) });
		const compiled = compileQuery('sort by due');
		expect(compiled.sort!(early, late, ctxFor([]))).toBeLessThan(0);
		expect(compiled.sort!(late, early, ctxFor([]))).toBeGreaterThan(0);
	});

	it('reverses when "reverse" is present', () => {
		const early = makeTask({ due: todayStr(1) });
		const late = makeTask({ due: todayStr(5) });
		const compiled = compileQuery('sort by due reverse');
		expect(compiled.sort!(early, late, ctxFor([]))).toBeGreaterThan(0);
	});

	it('applies secondary sort keys in order', () => {
		const a = makeTask({ priorityName: 'high', description: 'B task' });
		const b = makeTask({ priorityName: 'high', description: 'A task' });
		const compiled = compileQuery('sort by priority\nsort by description');
		expect(compiled.sort!(a, b, ctxFor([]))).toBeGreaterThan(0);
	});

	it('sort by function ranks by the returned value', () => {
		const short = makeTask({ description: 'ab' });
		const long = makeTask({ description: 'abcdef' });
		const compiled = compileQuery('sort by function task.description.length');
		expect(compiled.sort!(short, long, ctxFor([]))).toBeLessThan(0);
	});

	it('returns null when no sort instruction is present', () => {
		expect(compileQuery('done').sort).toBeNull();
	});
});

describe('group', () => {
	it('groups by priority name', () => {
		const task = makeTask({ priorityName: 'high' });
		const compiled = compileQuery('group by priority');
		expect(compiled.group!(task, ctxFor([]))).toEqual(['high']);
	});

	it('groups by tags, one key per tag for multi-membership', () => {
		const fx = makeFixtureSet();
		const compiled = compileQuery('group by tags');
		expect(compiled.group!(fx.multiTag, ctxFor([]))).toEqual(['#work', '#urgent', '#home']);
	});

	it('groups untagged tasks under a placeholder key', () => {
		const task = makeTask({ tags: [] });
		const compiled = compileQuery('group by tags');
		expect(compiled.group!(task, ctxFor([]))).toEqual(['(no tags)']);
	});

	it('group by function returns the function result as keys', () => {
		const task = makeTask({ path: 'A/b.md' });
		const compiled = compileQuery('group by function task.file.folder');
		expect(compiled.group!(task, ctxFor([]))).toEqual(['A']);
	});

	it('returns null when no group instruction is present', () => {
		expect(compileQuery('done').group).toBeNull();
	});

	it('exposes groupReverse from the "reverse" keyword', () => {
		expect(compileQuery('group by priority reverse').groupReverse).toBe(true);
		expect(compileQuery('group by priority').groupReverse).toBe(false);
	});
});
