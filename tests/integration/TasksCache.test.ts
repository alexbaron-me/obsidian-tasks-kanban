import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { TasksCache } from '../../src/integration/TasksCache';
import { makeTask } from '../fixtures/tasks';

describe('TasksCache', () => {
	it('is not ready until a payload arrives', () => {
		const app = new App();
		const cache = new TasksCache(app);
		expect(cache.isReady()).toBe(false);
		cache.start();
		// requestBootstrap fired synchronously via app.workspace.trigger, but nothing is
		// listening on the other end (no real Tasks plugin), so it stays unready.
		expect(cache.isReady()).toBe(false);
	});

	it('becomes ready and stores tasks on cache-update', () => {
		const app = new App();
		const cache = new TasksCache(app);
		cache.start();
		const task = makeTask({ description: 'from cache' });
		app.workspace.trigger('obsidian-tasks-plugin:cache-update', { tasks: [task], state: 'Cache' });
		expect(cache.isReady()).toBe(true);
		expect(cache.getTasks()).toEqual([task]);
	});

	it('subscribers fire immediately with current tasks, then on update', () => {
		const app = new App();
		const cache = new TasksCache(app);
		cache.start();
		const seen: (readonly unknown[])[] = [];
		cache.subscribe((tasks) => seen.push(tasks));
		expect(seen).toHaveLength(1);
		expect(seen[0]).toEqual([]);

		const task = makeTask();
		app.workspace.trigger('obsidian-tasks-plugin:cache-update', { tasks: [task], state: 'Cache' });
		expect(seen).toHaveLength(2);
		expect(seen[1]).toEqual([task]);
	});

	it('unsubscribe stops further notifications', () => {
		const app = new App();
		const cache = new TasksCache(app);
		cache.start();
		let calls = 0;
		const unsub = cache.subscribe(() => {
			calls++;
		});
		unsub();
		app.workspace.trigger('obsidian-tasks-plugin:cache-update', { tasks: [], state: 'Cache' });
		expect(calls).toBe(1); // only the initial synchronous call
	});

	it('requestBootstrap re-triggers the request event', () => {
		const app = new App();
		const cache = new TasksCache(app);
		cache.start();
		app.workspace.on('obsidian-tasks-plugin:request-cache-update', (cb) => {
			(cb as (data: { tasks: unknown[]; state: string }) => void)({ tasks: [makeTask()], state: 'Cache' });
		});
		cache.requestBootstrap();
		expect(cache.isReady()).toBe(true);
		expect(cache.getTasks()).toHaveLength(1);
	});

	it('missing tasks array defaults to empty', () => {
		const app = new App();
		const cache = new TasksCache(app);
		cache.start();
		app.workspace.trigger('obsidian-tasks-plugin:cache-update', { state: 'Cache' } as never);
		expect(cache.getTasks()).toEqual([]);
	});
});
