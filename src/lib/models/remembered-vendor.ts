/** The vendor the skills manifests (`.dialecte-skills.json` of each agent's skill folder) remember. */
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { AGENT_SKILL_FOLDERS, MANIFEST_FILE } from '../skills/sync-skills.constants.ts'
import { readSyncManifest } from '../skills/sync-skills.ts'
import { isVendorId } from './vendor-id.ts'

import type { RememberedVendor, VendorId } from './model-tiers.types.ts'

/** The skill folders (relative to `cwd`) holding a manifest, whatever it remembers. */
export function listManifestFolders(cwd: string): string[] {
	return Object.values(AGENT_SKILL_FOLDERS).filter((folder) =>
		existsSync(join(cwd, folder, MANIFEST_FILE)),
	)
}

/**
 * The vendor of the most recently written manifest that holds a known one. An unknown id is ignored with a
 * warning; manifests that disagree are named in a warning.
 */
export function readRememberedVendor(cwd: string): RememberedVendor {
	const warnings: string[] = []
	const entries: { folder: string; vendor: VendorId; writtenAt: number }[] = []
	for (const folder of listManifestFolders(cwd)) {
		const { vendor } = readSyncManifest(join(cwd, folder))
		if (vendor === undefined) continue
		if (!isVendorId(vendor)) {
			warnings.push(`${folder}/${MANIFEST_FILE}: unknown vendor "${vendor}" ignored`)
			continue
		}
		entries.push({
			folder,
			vendor,
			writtenAt: statSync(join(cwd, folder, MANIFEST_FILE)).mtimeMs,
		})
	}
	entries.sort((first, second) => second.writtenAt - first.writtenAt)
	if (new Set(entries.map((entry) => entry.vendor)).size > 1)
		warnings.push(
			`manifests disagree on the vendor (${entries.map((entry) => `${entry.folder}: ${entry.vendor}`).join(', ')}): using the most recent, ${entries[0].vendor}`,
		)
	return { vendor: entries[0]?.vendor, warnings }
}
