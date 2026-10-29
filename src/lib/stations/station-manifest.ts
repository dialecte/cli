/** The claude skills folder's manifest records what sync owns outside the skills: station agents, the session check. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { MANIFEST_FILE } from '../skills/sync-skills.constants.ts'
import { readSyncManifest, writeSyncManifest } from '../skills/sync-skills.ts'

/**
 * Sets (or clears, with `undefined` or an empty list) the fields of the manifest in `folder`, the rest of it as
 * it is. A folder without a manifest is left alone: nothing was synced there, so nothing is owned.
 */
export function updateStationManifest(params: {
	folder: string
	patch: {
		stationAgents?: string[] | undefined
		sessionCheck?: boolean
		settingsCreated?: boolean
		sessionCheckInserted?: string | undefined
	}
}): void {
	const { folder, patch } = params
	if (!existsSync(join(folder, MANIFEST_FILE))) return
	const manifest = readSyncManifest(folder)
	const { stationAgents, sessionCheck, settingsCreated, sessionCheckInserted, ...rest } = manifest
	writeSyncManifest({
		folder,
		manifest: {
			...rest,
			stationAgents: 'stationAgents' in patch ? patch.stationAgents : stationAgents,
			sessionCheck: 'sessionCheck' in patch ? patch.sessionCheck || undefined : sessionCheck,
			settingsCreated:
				'settingsCreated' in patch ? patch.settingsCreated || undefined : settingsCreated,
			sessionCheckInserted:
				'sessionCheckInserted' in patch ? patch.sessionCheckInserted : sessionCheckInserted,
		},
	})
}
