import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { copyShippedSchemas } from './src/lib/release/shipped-schemas.ts'

import { defineConfig } from 'tsup'

import type { Options } from 'tsup'

/** Where `npm run build` writes; `--out-dir` writes elsewhere. */
const OUT_DIR = 'dist'

/** The package root: the folder of this file, whatever folder the build runs from. */
const PACKAGE_ROOT = fileURLToPath(new URL('.', import.meta.url))

/** The pytest plugin in the sources, and its name next to the bin (where `dialecte tdd` finds it). */
const PYTEST_PLUGIN_SOURCE = 'src/lib/tdd/dialecte_tdd_pytest.py'
const PYTEST_PLUGIN_FILE = 'dialecte_tdd_pytest.py'

/** The corpus manifest and its override files in the sources, and their folder next to the bin (`dialecte corpus`). */
const CORPUS_SOURCE_FILES = ['src/lib/corpus/manifest.json', 'src/lib/corpus/overrides']
const CORPUS_FOLDER = 'corpus'

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
		// files another tool loads by path, next to the bin: the vitest and node --test reporters `dialecte tdd` hands
		// the package's runners, and the ignore rules Stryker loads as a plugin (`dialecte mutants run`)
		entry: {
			'tdd-reporter': 'src/lib/tdd/tdd-reporter.ts',
			'tdd-node-reporter': 'src/lib/tdd/tdd-node-reporter.ts',
			ignorers: 'src/lib/mutation/ignorers.ts',
		},
	},
]

/**
 * tsup builds these configs at once: a config that cleaned the output folder as its own build started could delete
 * what another one had already written (the tdd reporter, under load). So none cleans; tsup calls this function
 * once, before any build, and it empties the folder they write into (`--out-dir`, else `dist`), then copies the
 * schemas the package ships into it (`<out>/schemas/`; no build cleans, so they stay).
 */
export default defineConfig(function configs(options) {
	const outDir = options.outDir ?? OUT_DIR
	rmSync(outDir, { recursive: true, force: true })
	copyShippedSchemas({ root: PACKAGE_ROOT, outDir })
	copyPytestPlugin({ outDir })
	copyShippedCorpus({ outDir })
	return CONFIGS
})

/**
 * Copies the pytest plugin `dialecte tdd` loads into the package's python (`-p dialecte_tdd_pytest`) next to the
 * bin: a Python file, shipped as it is.
 */
function copyPytestPlugin(params: { outDir: string }): void {
	mkdirSync(params.outDir, { recursive: true })
	copyFileSync(join(PACKAGE_ROOT, PYTEST_PLUGIN_SOURCE), join(params.outDir, PYTEST_PLUGIN_FILE))
}

/** Copies the corpus manifest and its override files to `<out>/corpus/`, where the bin reads them. */
function copyShippedCorpus(params: { outDir: string }): void {
	const target = join(params.outDir, CORPUS_FOLDER)
	mkdirSync(target, { recursive: true })
	for (const source of CORPUS_SOURCE_FILES)
		cpSync(join(PACKAGE_ROOT, source), join(target, basename(source)), { recursive: true })
}
