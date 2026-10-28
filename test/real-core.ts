/**
 * The schema tests read core's own generated test definition through core's own readers: the core
 * `DIALECTE_CORE_DIR` names (a built core checkout) when set, else the cli's `@dialecte/core`
 * devDependency. With neither, the tests that need it fail, loudly - never skip.
 */
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { isCoreReaders, isDialecteConfig } from '../src/lib/schema/load-dialectes.ts'
import { MISSING_CORE } from './real-core.constants.ts'

import type { LoadedDialecte } from '../src/lib/schema/schema.types.ts'

/** The built files of the core the tests run on: its test entry and its utils. */
export function coreEntries(): { testEntry: string; utilsEntry: string; folder: string } {
	const base = resolve(
		process.env.DIALECTE_CORE_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..'),
	)
	const require = createRequire(join(base, 'package.json'))
	try {
		const utilsEntry = require.resolve('@dialecte/core/utils')
		return {
			testEntry: require.resolve('@dialecte/core/test'),
			utilsEntry,
			// <core>/dist/utils.js
			folder: dirname(dirname(utilsEntry)),
		}
	} catch {
		throw new Error(MISSING_CORE)
	}
}

/** core's test dialecte, as a dialecte package built on that core would be loaded. */
export async function loadCoreTestDialecte(): Promise<LoadedDialecte> {
	const { testEntry, utilsEntry, folder } = coreEntries()
	const testModule: Record<string, unknown> = await import(pathToFileURL(testEntry).href)
	const readers: Record<string, unknown> = await import(pathToFileURL(utilsEntry).href)
	const config = testModule.TEST_DIALECTE_CONFIG
	if (!isDialecteConfig(config) || !isCoreReaders(readers))
		throw new Error(`the core at ${folder} lacks its test dialecte or a reader: rebuild it`)
	return { packageName: '@dialecte/core-test', config, readers }
}

/** The XSD of core's test dialecte, as the core the tests run on ships it (`@dialecte/core/test/xsd/test.xsd`). */
export function coreTestSchema(): string {
	const { folder } = coreEntries()
	try {
		return createRequire(join(folder, 'package.json')).resolve('@dialecte/core/test/xsd/test.xsd')
	} catch {
		throw new Error(
			`the core at ${folder} ships no @dialecte/core/test/xsd/test.xsd: build a core that ships its test XSDs`,
		)
	}
}
