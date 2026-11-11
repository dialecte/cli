/**
 * R1-B5: a lot folder that is a link to a missing target is a lot folder with an identity nobody can read: it is
 * listed, and its readers name it damaged (identity unreadable) instead of never seeing it.
 */
import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { DAMAGED_NAME } from '../../test/damaged-lot-workspace.constants.ts'
import { damagedJson } from '../../test/damaged-lot-workspace.ts'
import { createStartWorkspace, withJson } from '../../test/lot-start-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { listLotFolderNames } from '../lib/store/store-folder.ts'
import { RECORD_DAMAGE_REASONS } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'

import { describe, expect, it } from 'vitest'

const MISSING_TARGET = 'no-such-folder'

/** A workspace whose store holds a link named like a lot folder, pointing at nothing. */
function workspaceWithDanglingLink() {
	const start = createStartWorkspace()
	mkdirSync(start.store, { recursive: true })
	symlinkSync(join(start.workspace.workspace, MISSING_TARGET), join(start.store, DAMAGED_NAME))
	return start
}

describe('a lot folder that is a link to a missing target', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the store’s lot folders are listed -> the link is among them', () => {
		const start = workspaceWithDanglingLink()

		expect(listLotFolderNames({ store: start.store })).toEqual([DAMAGED_NAME])
	})

	it('lot status --json -> damaged, identity unreadable, exit 6', () => {
		const start = workspaceWithDanglingLink()

		const status = runLot({ cwd: start.repository, argv: ['status', DAMAGED_NAME, '--json'] })

		expect({ exitCode: status.exitCode, json: withJson(status).json }).toEqual({
			exitCode: 6,
			json: damagedJson({ name: DAMAGED_NAME, reason: RECORD_DAMAGE_REASONS.identityUnreadable }),
		})
	})
})
