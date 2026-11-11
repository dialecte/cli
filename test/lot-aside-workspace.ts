/** A scratch common folder with a store holding one lot folder, for the cases of `moveLotAside`. */
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { moveLotAside } from '../src/lib/store/lot-aside.ts'
import { RECORD_DAMAGE_REASONS } from '../src/lib/store/store.constants.ts'
import { ASIDE_FOLDER } from './damaged-lot-workspace.constants.ts'
import {
	ASIDE_BY,
	ASIDE_LOT_NAME,
	ASIDE_REASON,
	STOPPED_AT,
} from './lot-aside-workspace.constants.ts'
import { temporaryFolder } from './scratch-repository.ts'
import { writeRecordFile } from './store-records.ts'

import type { MovedAside } from '../src/lib/store/lot-aside.types.ts'
import type { AsideWorkspace } from './lot-aside-workspace.types.ts'

/** A common folder holding a store with the lot folder `ASIDE_LOT_NAME`, which holds two files. */
export function createAsideWorkspace(): AsideWorkspace {
	const common = realpathSync(temporaryFolder('dialecte-aside-'))
	const lotFolder = join(common, 'dialecte-lots', ASIDE_LOT_NAME)
	writeRecordFile({ folder: lotFolder, name: 'brief.json', text: '{ "scope": ["src/"] }\n' })
	writeRecordFile({ folder: lotFolder, name: 'transitions/000001.json', text: '{}\n' })
	return { common, lotFolder, aside: join(common, ASIDE_FOLDER) }
}

/** The move of the folder `lotFolder` with the words of the aside cases; `beforeMove` is the seam between choosing the name and moving. */
export function moveOf(params: { lotFolder: string; beforeMove?: () => void }): MovedAside {
	return moveLotAside({
		lotFolder: params.lotFolder,
		reason: ASIDE_REASON,
		by: ASIDE_BY,
		now: STOPPED_AT,
		damage: RECORD_DAMAGE_REASONS.identityUnreadable,
		beforeMove: params.beforeMove,
	})
}

/** A folder of the aside folder that already holds a file. */
export function takeName(params: { workspace: AsideWorkspace; name: string }): void {
	writeRecordFile({
		folder: join(params.workspace.aside, params.name),
		name: 'earlier.txt',
		text: `${params.name}\n`,
	})
}
