import { rmSync } from 'node:fs'

import { defineConfig } from 'tsup'

import type { Options } from 'tsup'

/** Where `npm run build` writes; `--out-dir` writes elsewhere. */
const OUT_DIR = 'dist'

const SHARED: Options = {
	format: ['esm'],
	target: 'node22',
	platform: 'node',
	outDir: OUT_DIR,
	splitting: false,
	sourcemap: false,
	// The TypeScript compiler API is resolved from the consumer's install (peer dep), so the types
	// `audit` renders come from the same tsc that `bench` spawns. Never bundle it.
	external: ['typescript'],
}

const CONFIGS: Options[] = [
	{
		...SHARED,
		// the `dialecte` bin
		entry: ['src/cli.ts'],
		banner: {
			js: '#!/usr/bin/env node',
		},
	},
	{
		...SHARED,
		// the library entry `@dialecte/cli/lookups`, with its declaration files
		entry: ['src/lookups.ts'],
		// tsup's declaration build sets `baseUrl`, which TypeScript 6 deprecates
		dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
	},
	{
		...SHARED,
		// the vitest reporter `dialecte tdd` hands the package's vitest, next to the bin
		entry: { 'tdd-reporter': 'src/lib/tdd/tdd-reporter.ts' },
	},
]

/**
 * tsup builds these configs at once: a config that cleaned the output folder as its own build started could delete
 * what another one had already written (the tdd reporter, under load). So none cleans; tsup calls this function
 * once, before any build, and it empties the folder they write into (`--out-dir`, else `dist`).
 */
export default defineConfig(function configs(options) {
	rmSync(options.outDir ?? OUT_DIR, { recursive: true, force: true })
	return CONFIGS
})
