/**
 * The test code a test file depends on: the test-code files it imports (relative, tsconfig `paths` or vite
 * alias, barrels and re-exports followed) through test code; the specifiers that look local and resolve
 * nowhere; the files of the change whose name its text or its helpers' text holds (a fixture read from
 * disk); and its own snapshot file. A red run freezes a helper only through a file that depends on it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { isTestCode } from './tdd-files.ts'
import { moduleSpecifiers } from './test-source.ts'

import type { ModuleResolver } from './tdd.types.ts'

export function listTestDependencies(params: {
	root: string
	/** The test file, relative to the root. */
	file: string
	/** The test-code files of the change, relative to the root. */
	changedTestCode: readonly string[]
	resolveModule: ModuleResolver
}): { dependencies: string[]; unresolved: string[] } {
	const { root } = params
	const found = new Set<string>()
	const texts: string[] = []
	const unresolved = new Set<string>()
	const queue = [params.file]
	while (queue.length) {
		const current = queue.shift() ?? ''
		const text = readFileSync(join(root, current), 'utf8')
		texts.push(text)
		for (const specifier of moduleSpecifiers(text)) {
			const resolution = params.resolveModule({ specifier, from: current })
			if (resolution.kind === 'unresolved') {
				unresolved.add(specifier)
				continue
			}
			if (resolution.kind !== 'local') continue
			const resolved = resolution.file
			if (resolved === params.file || found.has(resolved) || !isTestCode(resolved)) continue
			found.add(resolved)
			queue.push(resolved)
		}
	}
	for (const candidate of params.changedTestCode)
		if (
			candidate !== params.file &&
			!found.has(candidate) &&
			texts.some((text) => text.includes(basename(candidate)))
		)
			found.add(candidate)
	const snapshot = join(dirname(params.file), '__snapshots__', `${basename(params.file)}.snap`)
	if (existsSync(join(root, snapshot))) found.add(snapshot)
	return { dependencies: [...found].sort(), unresolved: [...unresolved].sort() }
}
