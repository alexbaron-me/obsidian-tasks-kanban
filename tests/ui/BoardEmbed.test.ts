import { describe, expect, it } from 'vitest';
import { parseCodeblockSource } from '../../src/ui/BoardEmbed';

describe('parseCodeblockSource', () => {
	it('parses a file and view', () => {
		expect(parseCodeblockSource('file: projects.board\nview: Week')).toEqual({
			file: 'projects.board',
			view: 'Week',
		});
	});

	it('parses a file with no view', () => {
		expect(parseCodeblockSource('file: projects.board')).toEqual({ file: 'projects.board', view: undefined });
	});

	it('returns null when no file key is present', () => {
		expect(parseCodeblockSource('view: Week')).toBeNull();
	});

	it('ignores blank lines and is case-insensitive on keys', () => {
		expect(parseCodeblockSource('\nFILE: a.board\n\nVIEW: B\n')).toEqual({ file: 'a.board', view: 'B' });
	});
});
