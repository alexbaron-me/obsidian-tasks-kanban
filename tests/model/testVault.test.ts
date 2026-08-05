import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseBoardYaml } from '../../src/model/schema';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const boardsDir = path.resolve(dirname, '../../test-vault/Boards');

function readBoard(name: string): string {
	return readFileSync(path.join(boardsDir, name), 'utf8');
}

describe('test-vault/Boards fixtures', () => {
	it('Minimal.board parses cleanly with one view', () => {
		const result = parseBoardYaml(readBoard('Minimal.board'));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.errors).toEqual([]);
			expect(result.boardFile.views).toHaveLength(1);
			expect(result.boardFile.views[0]!.columns.buckets).toHaveLength(3);
		}
	});

	it('Full.board parses cleanly with three views exercising every generator', () => {
		const result = parseBoardYaml(readBoard('Full.board'));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.errors).toEqual([]);
			const [status, thisWeek, byTag] = result.boardFile.views;
			expect(status!.columns.generator).toBe('explicit');
			expect(status!.lanes?.groupBy).toBe('group by tags');
			expect(thisWeek!.columns.generator).toBe('rolling');
			expect(byTag!.columns.generator).toBe('auto');
		}
	});

	it('Malformed.board is reported as a parse error, not silently accepted', () => {
		const result = parseBoardYaml(readBoard('Malformed.board'));
		expect(result.ok).toBe(false);
	});
});
