import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { TasksApi, isTasksPluginEnabled } from '../../src/integration/TasksApi';

function withApiPlugin(app: App, api: Partial<Record<string, unknown>>): void {
	app.plugins.plugins['obsidian-tasks-plugin'] = { apiV1: api };
}

describe('TasksApi', () => {
	it('reports unavailable and returns null when Tasks is not installed', async () => {
		const app = new App();
		const api = new TasksApi(app);
		expect(api.isAvailable()).toBe(false);
		expect(isTasksPluginEnabled(app)).toBe(false);
		expect(await api.createTaskLineModal()).toBeNull();
		expect(await api.editTaskLineModal('- [ ] x')).toBeNull();
		expect(api.executeToggleTaskDoneCommand('- [ ] x', 'a.md')).toBeNull();
	});

	it('treats an empty string result as cancelled', async () => {
		const app = new App();
		withApiPlugin(app, {
			createTaskLineModal: async () => '',
			editTaskLineModal: async () => '',
		});
		const api = new TasksApi(app);
		expect(await api.createTaskLineModal()).toBeNull();
		expect(await api.editTaskLineModal('- [ ] x')).toBeNull();
	});

	it('returns the created/edited line when the modal resolves', async () => {
		const app = new App();
		withApiPlugin(app, {
			createTaskLineModal: async () => '- [ ] New task',
			editTaskLineModal: async () => '- [ ] Edited task',
		});
		const api = new TasksApi(app);
		expect(await api.createTaskLineModal()).toBe('- [ ] New task');
		expect(await api.editTaskLineModal('- [ ] x')).toBe('- [ ] Edited task');
	});

	it('splits a two-line result from executeToggleTaskDoneCommand', () => {
		const app = new App();
		withApiPlugin(app, {
			executeToggleTaskDoneCommand: () => '- [x] Done task\n- [ ] Recurring task 🔁 every week',
		});
		const api = new TasksApi(app);
		const result = api.executeToggleTaskDoneCommand('- [ ] Recurring task 🔁 every week', 'a.md');
		expect(result).toEqual(['- [x] Done task', '- [ ] Recurring task 🔁 every week']);
	});
});
