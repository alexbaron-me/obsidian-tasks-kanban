import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

// eslint-plugin-obsidianmd's rules (bundle size, UI conventions, supported-API checks, etc.) are
// about the shipped plugin bundle. Test files aren't shipped, so they don't apply — e.g. the
// mock `obsidian` module has to import the real `moment` package once to stand in for what
// Obsidian provides as a global at runtime, which the "don't bundle moment" rule can't tell
// apart from a real violation.
const obsidianRulesOff = Object.fromEntries(
	Object.keys(obsidianmd.rules).map((name) => [`obsidianmd/${name}`, 'off']),
);

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		'tests/tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['tests/**/*.ts', 'tests/**/*.tsx'],
		rules: {
			...obsidianRulesOff,
			'import/no-extraneous-dependencies': 'off',
		},
	},
	{
		files: ['tests/__mocks__/obsidian.ts'],
		rules: {
			// This file IS the `import { moment } from 'obsidian'` shim other code uses; it has
			// to import the real package once, here, to re-export it as Obsidian's global would.
			'@typescript-eslint/no-restricted-imports': 'off',
		},
	},
	{
		files: ['src/query/functions.ts'],
		rules: {
			// `filter/sort/group by function` (spec §6.3) is required to compile user-written
			// JS expressions at runtime, the same trust model as the Tasks plugin's own
			// filter-by-function support — there is deliberately no sandbox. `no-new-func`'s
			// inline disable is on eslint-comments' restricted list, so this is a config-level
			// override instead, scoped to just this one file.
			'no-new-func': 'off',
			'@typescript-eslint/no-implied-eval': 'off',
			'obsidianmd/rule-custom-message': 'off',
		},
	},
);
