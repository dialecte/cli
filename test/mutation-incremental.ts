/** A fake Stryker that reads, at call time, the incremental file its options name, and writes one when asked; and readers of the incremental store. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { INCREMENTAL_STORE_FOLDER } from '../src/lib/mutation/incremental-cache.constants.ts'
import { MUTATION_STORE_FOLDER } from '../src/lib/mutation/mutation.constants.ts'
import { LEGACY_INCREMENTAL_FILE } from './mutation-incremental.constants.ts'
import { fakeStryker, tierOf } from './mutation-package.ts'
import { commonGitDirOf } from './scratch-tree.ts'

import type {
	MutationReport,
	MutationTier,
	StrykerRunner,
} from '../src/lib/mutation/mutation.types.ts'
import type { IncrementalCall, TierFailure } from './mutation-incremental.types.ts'
import type { StrykerCall } from './mutation-package.types.ts'

/**
 * A Stryker that, for each call, records the state of the incremental file its options name; the fast tier (the
 * only one that names one) then writes `written(callNumber)` there, as Stryker does when it ends. A tier in
 * `failures` fails after that write; the others write their report as `fakeStryker` does.
 */
export function incrementalStryker(params: {
	root: string
	reports: Partial<Record<MutationTier, MutationReport>>
	calls: StrykerCall[]
	seen: IncrementalCall[]
	/** The text the fast tier writes at its incremental file; the call's number (from 1) tells the runs apart. */
	written: (callNumber: number) => string
	failures?: Partial<Record<MutationTier, TierFailure>>
}): StrykerRunner {
	const { root, reports, calls, seen, written, failures = {} } = params
	const inner = {
		ok: fakeStryker({ root, reports, calls }),
		throws: fakeStryker({ root, reports, calls, throws: true }),
		exit: fakeStryker({ root, reports, calls, exitCode: 3 }),
	}
	let fastCalls = 0
	return async function runIncrementalStryker({ options }) {
		const tier = tierOf(options.jsonReporter.fileName)
		const path =
			options.incrementalFile === undefined ? undefined : resolve(root, options.incrementalFile)
		const legacy = resolve(root, LEGACY_INCREMENTAL_FILE)
		// MUT-4, @stryker-mutator/core 10.0.0 (create/node_modules): the option is named `incrementalFile`
		// (dist/src/stryker-cli.js:112, dist/src/fs/project-reader.js:37); Stryker reads that path when incremental is on
		// (dist/src/fs/project-reader.js:272-277, absent file = full run at :308) and writes it, after a mkdir of its folder,
		// when it ends (dist/src/reporters/mutation-test-report-helper.js:125-128): this fake reads and writes the same way.
		seen.push({
			tier,
			incrementalFile: options.incrementalFile,
			existed: path !== undefined && existsSync(path),
			content: path !== undefined && existsSync(path) ? readFileSync(path, 'utf8') : undefined,
			legacyContent: existsSync(legacy) ? readFileSync(legacy, 'utf8') : undefined,
		})
		if (tier === 'fast') fastCalls += 1
		if (path !== undefined) {
			mkdirSync(dirname(path), { recursive: true })
			writeFileSync(path, written(fastCalls))
		}
		const failure = failures[tier]
		if (failure === 'no-report') {
			calls.push({ tier, options, runStatesAtCall: [] })
			return 0
		}
		return inner[failure === undefined ? 'ok' : failure]({ options })
	}
}

/** The files of the incremental store, by key, read from the git folder (not through the cache's own reader). */
export function storedIncrementalFiles(root: string): Record<string, string> {
	const folder = join(commonGitDirOf(root), MUTATION_STORE_FOLDER, INCREMENTAL_STORE_FOLDER)
	if (!existsSync(folder)) return {}
	return Object.fromEntries(
		readdirSync(folder).map((file) => [
			file.replace(/\.json$/, ''),
			readFileSync(join(folder, file), 'utf8'),
		]),
	)
}
