/** A lot whose worktree holds a package declaring its mutation scope, with an edit in scope, for the mutation step-event cases. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import { writeStoreLot } from './brief-workspace.ts'
import { EDITED_SCOPE_SOURCE, SCOPE_FILE, SCOPE_SOURCE } from './mutation-package.constants.ts'
import { createScratchRepository, git, writeFiles } from './scratch-repository.ts'
import { createStepLot } from './step-events-lot.ts'
import {
	MUTATION_DECLARATION,
	MUTATION_LOT_BRANCH,
	NAMED_BY_BRANCH_LOT,
} from './step-events-mutation.constants.ts'

import type { MutationLot } from './step-events-mutation.types.ts'

/**
 * A step lot whose package declares `MUTATION_DECLARATION` (unless `declared` is false); the scope file is edited
 * (uncommitted) in its worktree. The worktree is on a branch that names a SECOND real lot of the store
 * (`NAMED_BY_BRANCH_LOT`): the lot of the step is the worktree's, so that second lot must stay without events.
 */
export function createMutationLot(params: { declared?: boolean } = {}): MutationLot {
	const lot = createStepLot({
		...(params.declared !== false && { extraDialecte: { mutation: MUTATION_DECLARATION } }),
		files: { [SCOPE_FILE]: SCOPE_SOURCE },
	})
	writeFiles({ root: lot.worktree, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
	git({ root: lot.worktree, args: ['switch', '-q', '-c', MUTATION_LOT_BRANCH] })
	const namedByBranch = writeStoreLot({
		workspace: lot.workspace,
		name: NAMED_BY_BRANCH_LOT,
		scope: ['docs/'],
		branch: MUTATION_LOT_BRANCH,
		repository: lot.workspace.repository,
	})
	return { ...lot, namedByBranchEventsFile: join(namedByBranch, STORE_FILES.events) }
}

/** A plain checkout (no lot, no store) with the same package and the same edit. */
export function createPlainMutationCheckout(): string {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: 'demo', dialecte: { mutation: MUTATION_DECLARATION } })}\n`,
		[SCOPE_FILE]: SCOPE_SOURCE,
	})
	writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
	return root
}

/** The heavy markers a folder holds, parsed (none when the folder does not exist). */
export function markerDocumentsIn(folder: string): Record<string, unknown>[] {
	if (!existsSync(folder)) return []
	return readdirSync(folder)
		.filter((name) => name.endsWith('.json'))
		.sort()
		.map((name) => JSON.parse(readFileSync(join(folder, name), 'utf8')) as Record<string, unknown>)
}
