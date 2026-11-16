/**
 * Scratch packages for the tests of the base as round 0: a package of the runner asked, the base commit holding
 * `committed`, the lot's change (`written`) and its `.dialecte/lot.json` declaring `revised` cases in the working
 * tree after it.
 */
import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { git, writeFiles } from './scratch-repository.ts'
import { createVitestPackage } from './scratch-vitest-package.ts'
import {
	LOGGING_VITEST_TEST_TEMPLATE,
	REVISION_REASON,
} from './tdd-runners-base-red-workspace.constants.ts'
import { createNodePackage } from './tdd-runners-node-workspace.ts'
import { createPythonPackage } from './tdd-runners-python-workspace.ts'

import type { BaseRedPackageParts } from './tdd-runners-base-red-workspace.types.ts'

export function createBaseRedPackage(parts: BaseRedPackageParts): string {
	const root = createRunnerPackage(parts)
	const revised = (parts.revised ?? []).map((testCase) => ({
		case: testCase,
		reason: REVISION_REASON,
	}))
	writeFiles({
		root,
		files: {
			...parts.written,
			...(revised.length > 0 && { '.dialecte/lot.json': JSON.stringify({ revised }) }),
		},
	})
	return root
}

function createRunnerPackage(parts: BaseRedPackageParts): string {
	if (parts.runner === 'vitest') return createVitestPackage({ files: parts.committed })
	if (parts.runner === 'node') return createNodePackage({ committed: parts.committed })
	return createPythonPackage({ committed: parts.committed })
}

/**
 * The vitest file that appends to `log` each time it is loaded, whichever tree loads it, and holds one case
 * `add > one` expecting `expected` from `add(1, 2)`.
 */
export function loggingVitestTestText(params: { log: string; expected: number }): string {
	return LOGGING_VITEST_TEST_TEMPLATE.replace('{log}', () => params.log).replace('{expected}', () =>
		String(params.expected),
	)
}

/**
 * Everything a run could leave in or take from the package's tree: git's porcelain status, and every entry
 * of the tree (folders included, `.git` left out) with its modification time.
 */
export function snapshotTree(root: string): { status: string; entries: Record<string, number> } {
	const entries: Record<string, number> = {}
	for (const path of readdirSync(root, { recursive: true, encoding: 'utf8' }))
		if (path !== '.git' && !path.startsWith('.git/'))
			entries[path] = lstatSync(join(root, path)).mtimeMs
	return { status: git({ root, args: ['--no-optional-locks', 'status', '--porcelain'] }), entries }
}
