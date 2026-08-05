import type { Task } from '../types/tasks';

const ID_LENGTH = 6;
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomId(): string {
	let out = '';
	for (let i = 0; i < ID_LENGTH; i++) {
		out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
	}
	return out;
}

/**
 * Generates a 6-character lowercase base36 task id that doesn't collide with any id already
 * present in the cache. Never called in bulk or on load — only when the user manually drags a
 * task that doesn't yet have one (§5.4).
 */
export function generateTaskId(existingTasks: readonly Task[]): string {
	const taken = new Set(existingTasks.map((t) => t.id).filter((id) => id !== ''));
	let id = randomId();
	let guard = 0;
	while (taken.has(id) && guard < 1000) {
		id = randomId();
		guard++;
	}
	return id;
}
