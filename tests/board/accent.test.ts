import { describe, expect, it } from 'vitest';
import moment from 'moment';
import { compileAccentRules, matchAccent } from '../../src/board/accent';
import { makeTask } from '../fixtures/tasks';
import type { QueryContext } from '../../src/query/context';

function ctx(): QueryContext {
	return {
		file: { path: 'board.md', root: '/', folder: '', filename: 'board.md', filenameWithoutExtension: 'board', frontmatter: {} },
		allTasks: [],
		boardId: 'board.md',
		viewName: 'Test',
		today: moment(),
	};
}

describe('accent rules', () => {
	it('the first matching rule wins', () => {
		const compiled = compileAccentRules([
			{ name: 'Urgent', filter: 'priority is high', cssVar: '--color-red' },
			{ name: 'Any priority', filter: 'has due date', cssVar: '--color-blue' },
		]);
		const task = makeTask({ priorityName: 'high', due: '2026-08-14' });
		expect(matchAccent(compiled, task, ctx())?.name).toBe('Urgent');
	});

	it('returns null when no rule matches', () => {
		const compiled = compileAccentRules([{ name: 'Urgent', filter: 'priority is high', cssVar: '--color-red' }]);
		const task = makeTask({ priorityName: 'low' });
		expect(matchAccent(compiled, task, ctx())).toBeNull();
	});

	it('supports filter by function accent rules', () => {
		const compiled = compileAccentRules([
			{ name: 'Long', filter: 'filter by function task.description.length > 3', cssVar: '--color-red' },
		]);
		const task = makeTask({ description: 'A long description' });
		expect(matchAccent(compiled, task, ctx())?.name).toBe('Long');
	});
});
