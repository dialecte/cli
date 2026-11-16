/**
 * Scratch packages for the tests of the node runner: an ES module package of `node:test` files over a small
 * production module, a git repository committing `committed`, then `written` in the working tree (the change a
 * `tdd red` or `tdd green` reads).
 */
import { createScratchRepository, writeFiles } from './scratch-repository.ts'
import { NODE_PACKAGE_FILES } from './tdd-runners-node-workspace.constants.ts'

import type { NodePackageParts } from './tdd-runners-node-workspace.types.ts'

export function createNodePackage(parts: NodePackageParts): string {
	const root = createScratchRepository({ ...NODE_PACKAGE_FILES, ...parts.committed })
	writeFiles({ root, files: parts.written ?? {} })
	return root
}
