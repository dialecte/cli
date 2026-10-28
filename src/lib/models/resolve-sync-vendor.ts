/** The vendor `skills sync` remembers: given, already remembered, detected, or still to ask. */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { AGENT_SKILL_FOLDERS, MANIFEST_FILE } from '../skills/sync-skills.constants.ts'
import { readSyncManifest } from '../skills/sync-skills.ts'
import { detectVendor } from './detect-vendor.ts'
import { VENDOR_HOSTS, VENDOR_IDS } from './model-tiers.constants.ts'
import { listManifestFolders } from './remembered-vendor.ts'
import { isVendorId } from './vendor-id.ts'

import type { SyncVendorResolution, VendorDetection, VendorId } from './model-tiers.types.ts'

export function resolveSyncVendor(params: {
	/** `--vendor`. */
	given: string | undefined
	/** The vendor an earlier sync wrote in the manifests. */
	remembered: VendorId | undefined
	cwd: string
	/** Whether a person can answer a question on the terminal. */
	interactive: boolean
}): SyncVendorResolution {
	if (params.given !== undefined) {
		if (!isVendorId(params.given))
			throw new Error(
				`skills sync: unknown vendor ${params.given} (known: ${VENDOR_IDS.join(', ')})`,
			)
		return { kind: 'set', vendor: params.given }
	}
	if (params.remembered !== undefined) return { kind: 'set', vendor: params.remembered }
	const detection = detectProjectVendor(params.cwd)
	if (detection.kind === 'one') return { kind: 'set', vendor: detection.vendor }
	if (params.interactive)
		return {
			kind: 'ask',
			candidates: detection.kind === 'choose' ? detection.candidates : [...VENDOR_IDS],
		}
	const howToSet = `Pass \`--vendor <${VENDOR_IDS.join('|')}>\` to set it.`
	if (listManifestFolders(params.cwd).length > 0)
		return {
			kind: 'unset',
			notice: `skills sync: no vendor remembered for the models (\`dialecte models\`). ${howToSet}\n`,
		}
	return {
		kind: 'fail',
		output: `skills sync: which vendor's models does this project use? ${
			detection.kind === 'choose'
				? `Several agents or a multi-vendor host were detected (${detection.candidates.join(', ')}).`
				: 'No agent folder was detected.'
		} ${howToSet}\n`,
	}
}

/** What the project's own agent folders and files say about the vendor. */
export function detectProjectVendor(cwd: string): VendorDetection {
	return detectVendor({ presentPaths: presentPaths(cwd) })
}

/** The agent paths of the project that are the user's own: what only a sync wrote is no evidence. */
function presentPaths(cwd: string): Set<string> {
	const candidates = VENDOR_HOSTS.flatMap((host) => host.anyOf.flat())
	return new Set(
		candidates.filter(
			(path) => existsSync(join(cwd, path)) && !holdsOnlySyncedSkills({ cwd, path }),
		),
	)
}

/** True for a skills folder, or a folder holding only one, whose content is a manifest and the skills it lists. */
function holdsOnlySyncedSkills(params: { cwd: string; path: string }): boolean {
	const skillFolders = Object.values(AGENT_SKILL_FOLDERS)
	if (skillFolders.includes(params.path)) return isSyncedSkillsFolder(join(params.cwd, params.path))
	if (!statSync(join(params.cwd, params.path)).isDirectory()) return false
	const entries = readdirSync(join(params.cwd, params.path))
	const ownSkillFolders = skillFolders.filter((folder) => dirname(folder) === params.path)
	return (
		entries.length > 0 &&
		entries.every((entry) =>
			ownSkillFolders.some(
				(folder) => basename(folder) === entry && isSyncedSkillsFolder(join(params.cwd, folder)),
			),
		)
	)
}

function isSyncedSkillsFolder(folder: string): boolean {
	if (!existsSync(join(folder, MANIFEST_FILE))) return false
	const { installed } = readSyncManifest(folder)
	return readdirSync(folder).every((entry) => entry === MANIFEST_FILE || installed.includes(entry))
}
