import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			react: 'preact/compat',
			'react-dom': 'preact/compat',
			obsidian: path.resolve(dirname, 'tests/__mocks__/obsidian.ts'),
		},
	},
	test: {
		environment: 'jsdom',
		globals: false,
		include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
	},
});
