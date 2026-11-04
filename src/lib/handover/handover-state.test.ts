import { rmSync } from 'node:fs'

import { STORE_FIRST_NAME } from '../../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	createLinkedWorktree,
	markAbandoned,
	writeStoreHandover,
} from '../../../test/handover-store-scenario.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { HANDOVER_FILES } from './handover.constants.ts'
import { handoverState } from './list-handovers.ts'
import { readHandoverFolder } from './read-handover-folder.ts'

import { describe, expect, it } from 'vitest'

import type { HandoverFolder, HandoverState } from './handover.types.ts'

function stateOf(folder: string): HandoverState {
	return handoverState(readHandoverFolder(folder) as HandoverFolder)
}

describe('handoverState of an abandoned hand-over', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a folder holding the abandoned marker → abandoned, whatever its lots are', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' },
		})
		markAbandoned({ folder, file: HANDOVER_FILES.abandoned })

		expect(stateOf(folder)).toBe('abandoned')
	})

	it('a marked folder whose repository is gone → abandoned (the marker is read before any git question)', () => {
		const main = createBranchRepository()
		const linked = createLinkedWorktree({ root: main, branch: 'feat/gone' })
		const { folder } = writeStoreHandover({
			root: linked,
			name: STORE_FIRST_NAME,
			changes: { 'src/gone.ts': 'export const gone = 1\n' },
		})
		markAbandoned({ folder, file: HANDOVER_FILES.abandoned })
		rmSync(linked, { recursive: true, force: true })

		expect(stateOf(folder)).toBe('abandoned')
	})
})
