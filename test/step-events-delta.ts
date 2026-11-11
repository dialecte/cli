/** Two lots of one repository, for case 13 of the step events: the review of one is asked from the worktree of the other. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import { writeStoreLot } from './brief-workspace.ts'
import { OTHER_LOT, OTHER_LOT_SCOPE } from './step-events-delta.constants.ts'
import { createStepLot } from './step-events-lot.ts'

import type { DeltaScene } from './step-events-delta.types.ts'

/**
 * The step lot (the folder the command runs in), and a second lot of the same store whose folder holds an empty
 * round-1 snapshot (`round-1/`, `round-1.deleted`).
 */
export function createDeltaScene(): DeltaScene {
	const inLot = createStepLot()
	const lotFolder = writeStoreLot({
		workspace: inLot.workspace,
		name: OTHER_LOT,
		scope: OTHER_LOT_SCOPE,
		branch: 'feat/other',
		repository: inLot.workspace.repository,
	})
	mkdirSync(join(lotFolder, 'round-1'), { recursive: true })
	writeFileSync(join(lotFolder, 'round-1.deleted'), '')
	return {
		inLot,
		named: { name: OTHER_LOT, lotFolder, eventsFile: join(lotFolder, STORE_FILES.events) },
	}
}
