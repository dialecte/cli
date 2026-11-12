/** StrykerJS as the package in the current folder installs it. */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { StrykerModule, StrykerOptions } from './mutation.types.ts'

/** Runs StrykerJS as the package in the current folder installs it, with the options in memory. */
export async function runStrykerOfPackage(params: { options: StrykerOptions }): Promise<number> {
	const requireFromPackage = createRequire(join(process.cwd(), 'package.json'))
	const entry = requireFromPackage.resolve('@stryker-mutator/core')
	const strykerModule = (await import(pathToFileURL(entry).href)) as StrykerModule
	const stryker = new strykerModule.Stryker(params.options)
	await stryker.runMutationTest()
	return 0
}
