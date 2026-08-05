import { describe, expect, it } from 'vitest';
import { App, moment } from 'obsidian';
import { decideDrop, executeDrop, fieldWriterTransform, type DropParams } from '../../src/board/dropController';
import { FieldWriter } from '../../src/write/FieldWriter';
import { TaskWriter } from '../../src/write/TaskWriter';
import { TasksApi } from '../../src/integration/TasksApi';
import { TasksCache } from '../../src/integration/TasksCache';
import { makeTask } from '../fixtures/tasks';
import type { TaskStatus } from '../../src/types/tasks';

const TODO: TaskStatus = { symbol: ' ', name: 'Todo', type: 'TODO', nextStatusSymbol: 'x' };
const DONE: TaskStatus = { symbol: 'x', name: 'Done', type: 'DONE', nextStatusSymbol: ' ' };
const resolveStatus = (symbol: string) => ([TODO, DONE].find((s) => s.symbol === symbol) ?? null);

function baseParams(overrides: Partial<DropParams> = {}): DropParams {
	return {
		task: makeTask(),
		columnWriteValue: { kind: 'status', symbol: ' ' },
		isBlocked: false,
		blockedDropMode: 'soft',
		resolveStatus,
		...overrides,
	};
}

describe('decideDrop', () => {
	it('rejects a column with no writeValue', () => {
		expect(decideDrop(baseParams({ columnWriteValue: null })).ok).toBe(false);
	});

	it('rejects a non-writable lane', () => {
		expect(decideDrop(baseParams({ laneWriteValue: null })).ok).toBe(false);
	});

	it('allows a within-lane move when laneWriteValue is omitted', () => {
		expect(decideDrop(baseParams()).ok).toBe(true);
	});

	it('hard-rejects completing a blocked task', () => {
		const decision = decideDrop(
			baseParams({ columnWriteValue: { kind: 'status', symbol: 'x' }, isBlocked: true, blockedDropMode: 'hard' }),
		);
		expect(decision.ok).toBe(false);
	});

	it('soft-warns completing a blocked task', () => {
		const decision = decideDrop(
			baseParams({ columnWriteValue: { kind: 'status', symbol: 'x' }, isBlocked: true, blockedDropMode: 'soft' }),
		);
		expect(decision.ok).toBe(true);
		expect(decision.proceedWithWarning).toBeDefined();
	});

	it('hard-rejects a drop that would exceed a hard WIP limit', () => {
		const decision = decideDrop(baseParams({ wip: { countAfterMove: 4, max: 3, mode: 'hard' } }));
		expect(decision.ok).toBe(false);
	});

	it('soft-warns a drop that would exceed a soft WIP limit', () => {
		const decision = decideDrop(baseParams({ wip: { countAfterMove: 4, max: 3, mode: 'soft' } }));
		expect(decision.ok).toBe(true);
		expect(decision.proceedWithWarning).toBeDefined();
	});

	it('allows a drop within the WIP limit', () => {
		const decision = decideDrop(baseParams({ wip: { countAfterMove: 2, max: 3, mode: 'hard' } }));
		expect(decision.ok).toBe(true);
		expect(decision.proceedWithWarning).toBeUndefined();
	});
});

describe('fieldWriterTransform', () => {
	const fw = new FieldWriter('emoji');
	it('applies a status writeValue', () => {
		const t = fieldWriterTransform(fw, { kind: 'status', symbol: '/' });
		expect(t('- [ ] Task')).toBe('- [/] Task');
	});
	it('applies a date writeValue', () => {
		const t = fieldWriterTransform(fw, { kind: 'date', field: 'due', value: moment('2026-08-14') });
		expect(t('- [ ] Task')).toBe('- [ ] Task 📅 2026-08-14');
	});
	it('applies a priority writeValue', () => {
		const t = fieldWriterTransform(fw, { kind: 'priority', value: 'high' });
		expect(t('- [ ] Task')).toBe('- [ ] Task ⏫');
	});
	it('applies a tags writeValue, adding the target and removing every other bucket tag', () => {
		const t = fieldWriterTransform(fw, { kind: 'tags', add: '#doing', removeOthers: ['#todo', '#done'] });
		expect(t('- [ ] Task #todo')).toBe('- [ ] Task #doing');
	});
});

describe('executeDrop', () => {
	function setup() {
		const app = new App();
		const fieldWriter = new FieldWriter('emoji');
		const tasksApi = new TasksApi(app);
		const tasksCache = new TasksCache(app);
		const taskWriter = new TaskWriter(app, fieldWriter, tasksApi, tasksCache);
		return { app, fieldWriter, taskWriter };
	}

	it('routes a DONE column write through TaskWriter.completeTask', async () => {
		const { app, fieldWriter, taskWriter } = setup();
		const task = makeTask({ description: 'Finish', lineNumber: 0, path: 'a.md', status: ' ' });
		app.vault.setFileContent('a.md', `${task.originalMarkdown}\n`);
		app.plugins.plugins['obsidian-tasks-plugin'] = {
			apiV1: { executeToggleTaskDoneCommand: () => '- [x] Finish ✅ 2026-08-05' },
		};
		const { decision, result } = await executeDrop(taskWriter, fieldWriter, baseParams({
			task,
			columnWriteValue: { kind: 'status', symbol: 'x' },
		}));
		expect(decision.ok).toBe(true);
		expect(result?.ok).toBe(true);
		const content = await app.vault.read(app.vault.getFileByPath('a.md')!);
		expect(content).toContain('✅ 2026-08-05');
	});

	it('combines a column write and a cross-lane write into a single guarded write', async () => {
		const { app, fieldWriter, taskWriter } = setup();
		const task = makeTask({ description: 'Task', lineNumber: 0, path: 'a.md', status: ' ' });
		app.vault.setFileContent('a.md', `${task.originalMarkdown}\n`);
		const { result } = await executeDrop(taskWriter, fieldWriter, baseParams({
			task,
			columnWriteValue: { kind: 'status', symbol: '/' },
			laneWriteValue: { kind: 'priority', value: 'high' },
		}));
		expect(result?.ok).toBe(true);
		const content = await app.vault.read(app.vault.getFileByPath('a.md')!);
		expect(content).toContain('[/]');
		expect(content).toContain('⏫');
	});

	it('does not write anything when the decision rejects the drop', async () => {
		const { app, fieldWriter, taskWriter } = setup();
		const task = makeTask({ path: 'a.md', lineNumber: 0 });
		app.vault.setFileContent('a.md', `${task.originalMarkdown}\n`);
		const { decision, result } = await executeDrop(taskWriter, fieldWriter, baseParams({ task, columnWriteValue: null }));
		expect(decision.ok).toBe(false);
		expect(result).toBeUndefined();
		const content = await app.vault.read(app.vault.getFileByPath('a.md')!);
		expect(content).toBe(`${task.originalMarkdown}\n`);
	});
});
