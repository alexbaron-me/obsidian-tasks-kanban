import { describe, expect, it } from 'vitest';
import { moment } from 'obsidian';
import { buildChips, isBlockedDimmed } from '../../src/board/chips';
import { makeTask, todayStr } from '../fixtures/tasks';
import type { QueryContext } from '../../src/query/context';

function ctx(allTasks: ReturnType<typeof makeTask>[] = []): QueryContext {
	return {
		file: { path: 'board.md', root: '/', folder: '', filename: 'board.md', filenameWithoutExtension: 'board', frontmatter: {} },
		allTasks,
		boardId: 'board.md',
		viewName: 'Test',
		today: moment(todayStr()),
	};
}

describe('buildChips', () => {
	it('omits a date chip when the field is unset', () => {
		const task = makeTask({ due: null });
		expect(buildChips(['due'], task, ctx())).toEqual([]);
	});

	it('labels due today/tomorrow/yesterday specially', () => {
		expect(buildChips(['due'], makeTask({ due: todayStr(0) }), ctx())[0]!.label).toBe('today');
		expect(buildChips(['due'], makeTask({ due: todayStr(1) }), ctx())[0]!.label).toBe('tomorrow');
		expect(buildChips(['due'], makeTask({ due: todayStr(-1) }), ctx())[0]!.label).toBe('yesterday');
	});

	it('marks a past due date as overdue, but not a past scheduled date', () => {
		const overdue = buildChips(['due'], makeTask({ due: todayStr(-5) }), ctx())[0]!;
		expect(overdue.variant).toBe('overdue');
		const scheduled = buildChips(['scheduled'], makeTask({ scheduled: todayStr(-5) }), ctx())[0]!;
		expect(scheduled.variant).toBe('normal');
	});

	it('omits the priority chip for "none"', () => {
		expect(buildChips(['priority'], makeTask({ priorityName: 'none' }), ctx())).toEqual([]);
	});

	it('renders one chip per tag', () => {
		const task = makeTask({ tags: ['#work', '#home'] });
		const chips = buildChips(['tags'], task, ctx());
		expect(chips.map((c) => c.tag)).toEqual(['#work', '#home']);
	});

	it('renders a dependency chip with the unmet blocker count', () => {
		const blocker = makeTask({ id: 'b1', status: ' ' });
		const task = makeTask({ dependsOn: ['b1'] });
		expect(buildChips(['dependency'], task, ctx([blocker, task]))[0]!.label).toBe('1');
	});

	it('omits the dependency chip once all blockers are done', () => {
		const blocker = makeTask({ id: 'b1', status: 'x', done: todayStr() });
		const task = makeTask({ dependsOn: ['b1'] });
		expect(buildChips(['dependency'], task, ctx([blocker, task]))).toEqual([]);
	});

	it('renders a children rollup as done/total', () => {
		const task = makeTask({
			children: [makeTask({ status: 'x', done: todayStr() }), makeTask({ status: ' ' })],
		});
		expect(buildChips(['children'], task, ctx())[0]!.label).toBe('1/2');
	});

	it('preserves the configured chip order', () => {
		const task = makeTask({ priorityName: 'high', due: todayStr() });
		const chips = buildChips(['due', 'priority'], task, ctx());
		expect(chips.map((c) => c.kind)).toEqual(['due', 'priority']);
	});
});

describe('isBlockedDimmed', () => {
	it('is true when any blocker is unmet', () => {
		const blocker = makeTask({ id: 'b1', status: ' ' });
		const task = makeTask({ dependsOn: ['b1'] });
		expect(isBlockedDimmed(task, [blocker, task])).toBe(true);
	});
	it('is false with no dependsOn', () => {
		expect(isBlockedDimmed(makeTask(), [])).toBe(false);
	});
});
