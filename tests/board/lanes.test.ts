import { describe, expect, it } from 'vitest';
import moment from 'moment';
import { buildLanes } from '../../src/board/lanes';
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

describe('buildLanes', () => {
	it('returns a single ungrouped lane when spec is null', () => {
		const tasks = [makeTask(), makeTask()];
		const { lanes } = buildLanes(null, tasks, ctx());
		expect(lanes).toHaveLength(1);
		expect(lanes[0]!.tasks).toHaveLength(2);
	});

	it('groups into one lane per distinct key', () => {
		const high = makeTask({ priorityName: 'high' });
		const low = makeTask({ priorityName: 'low' });
		const { lanes } = buildLanes({ groupBy: 'group by priority' }, [high, low], ctx());
		expect(lanes.map((l) => l.id).sort()).toEqual(['high', 'low']);
	});

	it('a multi-valued group key duplicates the card across lanes', () => {
		const task = makeTask({ tags: ['#work', '#home'] });
		const { lanes } = buildLanes({ groupBy: 'group by tags' }, [task], ctx());
		expect(lanes).toHaveLength(2);
		for (const lane of lanes) expect(lane.tasks).toContain(task);
	});

	it('reverses lane order when the group instruction says reverse', () => {
		const a = makeTask({ priorityName: 'high' });
		const b = makeTask({ priorityName: 'low' });
		const forward = buildLanes({ groupBy: 'group by priority' }, [a, b], ctx()).lanes.map((l) => l.id);
		const reversed = buildLanes({ groupBy: 'group by priority reverse' }, [a, b], ctx()).lanes.map((l) => l.id);
		expect(reversed).toEqual([...forward].reverse());
	});

	it('builds a nested second level, at most two levels deep', () => {
		const a = makeTask({ priorityName: 'high', tags: ['#work'] });
		const b = makeTask({ priorityName: 'high', tags: ['#home'] });
		const { lanes } = buildLanes({ groupBy: 'group by priority', nested: 'group by tags' }, [a, b], ctx());
		const high = lanes.find((l) => l.id === 'high')!;
		expect(high.nested).not.toBeNull();
		expect(high.nested!.map((l) => l.id).sort()).toEqual(['#home', '#work']);
		expect(high.nested![0]!.nested).toBeNull();
	});

	it('surfaces a compile error from a malformed groupBy instruction as a warning', () => {
		const { warnings } = buildLanes({ groupBy: 'group by nonsense' }, [makeTask()], ctx());
		expect(warnings.length).toBeGreaterThan(0);
	});
});
