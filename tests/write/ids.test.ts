import { describe, expect, it } from 'vitest';
import { generateTaskId } from '../../src/write/ids';
import { makeTask } from '../fixtures/tasks';

describe('generateTaskId', () => {
	it('generates a 6-character lowercase base36 id', () => {
		const id = generateTaskId([]);
		expect(id).toMatch(/^[a-z0-9]{6}$/);
	});

	it('never collides with an existing task id', () => {
		const existing = Array.from({ length: 50 }, (_, i) => makeTask({ id: `taken${i}`.slice(0, 6) }));
		const id = generateTaskId(existing);
		expect(existing.some((t) => t.id === id)).toBe(false);
	});

	it('ignores tasks without an id when checking collisions', () => {
		const existing = [makeTask({ id: '' }), makeTask({ id: '' })];
		expect(() => generateTaskId(existing)).not.toThrow();
	});
});
