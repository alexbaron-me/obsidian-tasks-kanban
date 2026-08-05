import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { TaskWriter } from '../../src/write/TaskWriter';
import { FieldWriter } from '../../src/write/FieldWriter';
import { TasksApi } from '../../src/integration/TasksApi';
import { TasksCache } from '../../src/integration/TasksCache';
import { makeTask } from '../fixtures/tasks';

function setup() {
	const app = new App();
	const fieldWriter = new FieldWriter('emoji');
	const tasksApi = new TasksApi(app);
	const tasksCache = new TasksCache(app);
	const writer = new TaskWriter(app, fieldWriter, tasksApi, tasksCache);
	return { app, writer, tasksApi };
}

describe('TaskWriter — write guard', () => {
	it('rejects a write when the file no longer exists', async () => {
		const { writer } = setup();
		const task = makeTask({ path: 'missing.md' });
		const result = await writer.setPriority(task, 'high');
		expect(result).toEqual({ ok: false, reason: 'file-missing' });
	});

	it('rejects a stale write when the source line has changed on disk', async () => {
		const { app, writer } = setup();
		const task = makeTask({ description: 'Original', lineNumber: 0, path: 'a.md' });
		app.vault.setFileContent('a.md', 'A different line entirely\n');
		const result = await writer.setPriority(task, 'high');
		expect(result).toEqual({ ok: false, reason: 'stale' });
	});

	it('applies the write when the line matches originalMarkdown exactly', async () => {
		const { app, writer } = setup();
		const task = makeTask({ description: 'Original', lineNumber: 0, path: 'a.md' });
		app.vault.setFileContent('a.md', `${task.originalMarkdown}\n`);
		const result = await writer.setPriority(task, 'high');
		expect(result.ok).toBe(true);
		const content = await app.vault.read(app.vault.getFileByPath('a.md')!);
		expect(content).toContain('⏫');
	});

	it('touches only the target line, leaving surrounding lines untouched', async () => {
		const { app, writer } = setup();
		const task = makeTask({ description: 'Middle', lineNumber: 1, path: 'a.md' });
		app.vault.setFileContent('a.md', `# Heading\n${task.originalMarkdown}\nAnother line\n`);
		await writer.setPriority(task, 'low');
		const content = await app.vault.read(app.vault.getFileByPath('a.md')!);
		const lines = content.split('\n');
		expect(lines[0]).toBe('# Heading');
		expect(lines[2]).toBe('Another line');
		expect(lines[1]).toContain('🔽');
	});
});

describe('TaskWriter — status routing', () => {
	it('routes a DONE transition through apiV1, not its own writer', async () => {
		const { app, writer } = setup();
		const task = makeTask({ description: 'Finish report', lineNumber: 0, path: 'a.md', status: ' ' });
		app.vault.setFileContent('a.md', `${task.originalMarkdown}\n`);
		app.plugins.plugins['obsidian-tasks-plugin'] = {
			apiV1: {
				executeToggleTaskDoneCommand: () => `- [x] Finish report ✅ 2026-08-05`,
			},
		};
		const result = await writer.setStatus(task, { symbol: 'x', name: 'Done', type: 'DONE', nextStatusSymbol: ' ' });
		expect(result.ok).toBe(true);
		const content = await app.vault.read(app.vault.getFileByPath('a.md')!);
		expect(content).toContain('- [x] Finish report ✅ 2026-08-05');
	});

	it('splices two lines when a recurring task completes', async () => {
		const { app, writer } = setup();
		const task = makeTask({ description: 'Water plants 🔁 every week', lineNumber: 0, path: 'a.md' });
		app.vault.setFileContent('a.md', `${task.originalMarkdown}\nOther line\n`);
		app.plugins.plugins['obsidian-tasks-plugin'] = {
			apiV1: {
				executeToggleTaskDoneCommand: () =>
					'- [x] Water plants 🔁 every week ✅ 2026-08-05\n- [ ] Water plants 🔁 every week 📅 2026-08-12',
			},
		};
		const result = await writer.setStatus(task, { symbol: 'x', name: 'Done', type: 'DONE', nextStatusSymbol: ' ' });
		expect(result.ok).toBe(true);
		const content = await app.vault.read(app.vault.getFileByPath('a.md')!);
		const lines = content.split('\n');
		expect(lines.filter((l) => l.length > 0)).toHaveLength(3);
		expect(lines[0]).toContain('✅ 2026-08-05');
		expect(lines[1]).toContain('📅 2026-08-12');
		expect(lines[2]).toBe('Other line');
	});

	it('rejects a DONE transition when the Tasks API is unavailable', async () => {
		const { app, writer } = setup();
		const task = makeTask({ path: 'a.md', lineNumber: 0 });
		app.vault.setFileContent('a.md', `${task.originalMarkdown}\n`);
		const result = await writer.setStatus(task, { symbol: 'x', name: 'Done', type: 'DONE', nextStatusSymbol: ' ' });
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('rejected');
	});

	it('writes a non-DONE status change via its own FieldWriter, not the API', async () => {
		const { app, writer } = setup();
		const task = makeTask({ path: 'a.md', lineNumber: 0, status: ' ' });
		app.vault.setFileContent('a.md', `${task.originalMarkdown}\n`);
		const result = await writer.setStatus(task, { symbol: '/', name: 'In Progress', type: 'IN_PROGRESS', nextStatusSymbol: 'x' });
		expect(result.ok).toBe(true);
		const content = await app.vault.read(app.vault.getFileByPath('a.md')!);
		expect(content).toContain('- [/]');
	});
});

describe('TaskWriter — modal-routed mutations', () => {
	it('editViaModal writes the returned line and is a no-op on cancel', async () => {
		const { app, writer } = setup();
		const task = makeTask({ path: 'a.md', lineNumber: 0 });
		app.vault.setFileContent('a.md', `${task.originalMarkdown}\n`);
		app.plugins.plugins['obsidian-tasks-plugin'] = { apiV1: { editTaskLineModal: async () => '' } };
		const cancelled = await writer.editViaModal(task);
		expect(cancelled).toEqual({ ok: true, reason: 'cancelled' });

		app.plugins.plugins['obsidian-tasks-plugin'] = {
			apiV1: { editTaskLineModal: async () => '- [ ] Edited description' },
		};
		const result = await writer.editViaModal(task);
		expect(result.ok).toBe(true);
		const content = await app.vault.read(app.vault.getFileByPath('a.md')!);
		expect(content).toContain('- [ ] Edited description');
	});

	it('createTaskViaModal appends the created line to the target file', async () => {
		const { app, writer } = setup();
		app.plugins.plugins['obsidian-tasks-plugin'] = {
			apiV1: { createTaskLineModal: async () => '- [ ] New task' },
		};
		await writer.createTaskViaModal('inbox.md');
		const content = await app.vault.read(app.vault.getFileByPath('inbox.md')!);
		expect(content).toContain('- [ ] New task');
	});

	it('createTaskViaModal applies the target bucket value before appending', async () => {
		const { app, writer } = setup();
		app.plugins.plugins['obsidian-tasks-plugin'] = {
			apiV1: { createTaskLineModal: async () => '- [ ] New task' },
		};
		await writer.createTaskViaModal('inbox.md', (line) => `${line} 🔺`);
		const content = await app.vault.read(app.vault.getFileByPath('inbox.md')!);
		expect(content).toContain('- [ ] New task 🔺');
	});
});

describe('TaskWriter — description edits', () => {
	it('rewrites only the description, preserving fields and status', async () => {
		const { app, writer } = setup();
		const task = makeTask({ description: 'Old text', due: '2026-08-14', lineNumber: 0, path: 'a.md' });
		app.vault.setFileContent('a.md', `${task.originalMarkdown}\n`);
		await writer.setDescription(task, 'New text');
		const content = await app.vault.read(app.vault.getFileByPath('a.md')!);
		expect(content).toContain('New text');
		expect(content).toContain('📅 2026-08-14');
		expect(content).not.toContain('Old text');
	});
});
