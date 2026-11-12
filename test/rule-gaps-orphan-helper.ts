/**
 * Scratch packages for the tests of a `revised` helper no changed test file depends on: the helper and its one
 * dependent are committed, then the helper is changed in the working tree.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	ORPHAN_DEPENDENT_TEST,
	ORPHAN_DEPENDENT_TEST_TEXT,
	ORPHAN_EDITED_HELPER_TEXT,
	ORPHAN_HELPER,
	ORPHAN_HELPER_TEXT,
	ORPHAN_PRODUCTION,
} from './rule-gaps-orphan-helper.constants.ts'
import { writeFiles } from './scratch-repository.ts'
import { createVitestPackage } from './scratch-vitest-package.ts'

/**
 * A package committing the production, the helper and the one test file importing it; then the helper is
 * changed and the lot file written when `lot` is given (its `revised` entries).
 */
export function createOrphanHelperPackage(
	params: { lot?: unknown; files?: Record<string, string> } = {},
): string {
	const root = createVitestPackage({
		files: {
			'src/add.ts': ORPHAN_PRODUCTION,
			[ORPHAN_HELPER]: ORPHAN_HELPER_TEXT,
			[ORPHAN_DEPENDENT_TEST]: ORPHAN_DEPENDENT_TEST_TEXT,
		},
	})
	writeFileSync(join(root, ORPHAN_HELPER), ORPHAN_EDITED_HELPER_TEXT)
	if (params.lot !== undefined)
		writeFiles({ root, files: { '.dialecte/lot.json': JSON.stringify({ revised: params.lot }) } })
	if (params.files) writeFiles({ root, files: params.files })
	return root
}
