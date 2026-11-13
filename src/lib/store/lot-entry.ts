/**
 * A lot whose hand-over was committed outside its own folder, read as committed once its branch landed: the git
 * probe, the reading that wraps `readCheckedLotState`, the line that names why. The entry rule (files only) lives in
 * `committed-elsewhere.ts`, shared with the git-free reader; it is exported from here too.
 */
import { findBaseBranchRef, findBranchRef } from '../gate/gate-base.ts'
import { isAncestorCommit, tryReadGit } from '../git.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import { committedElsewhereEntry, isResumedAfterEntry } from './committed-elsewhere.ts'
import { LANDED_LINE } from './lot-entry.constants.ts'
import { readCheckedLotState } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { entryDamageOf } from './record-checks.ts'
import { LOTS_KEEPING_NOTHING } from './store.constants.ts'

import type { StoreEntry } from '../handover/handover.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type {
	LandedLotState,
	LandedProbe,
	LandedReading,
	LandedTarget,
	LandedTargetResolution,
} from './lot-entry.types.ts'
import type { LotIdentity, LotStateReadParams } from './store.types.ts'

export { committedElsewhereEntry } from './committed-elsewhere.ts'

/**
 * The probe of the landed reading at the repository `root`: its target branch is resolved once, at its first call,
 * unless `target` hands over the one a caller already resolved (`undefined` inside it: none was found).
 */
export function createLandedProbe(params: {
	root: string
	packageJson: PackageJson
	target?: { found: LandedTarget | undefined }
}): LandedProbe {
	const resolution: LandedTargetResolution =
		params.target === undefined
			? { resolved: false }
			: { resolved: true, target: params.target.found }
	return function landedProbe(call) {
		return probeLanded({ root: params.root, packageJson: params.packageJson, ...call, resolution })
	}
}

/**
 * The lot's branch tip is not its base commit and is on the target branch: the reading naming the entry, its folder
 * and the target. Undefined when it is not, when the branch is gone, or when no target branch was found.
 */
function probeLanded(params: {
	root: string
	packageJson: PackageJson
	identity: LotIdentity
	entry: StoreEntry
	resolution: LandedTargetResolution
}): LandedReading | undefined {
	const { root, identity, entry } = params
	const target = targetOf(params)
	if (target === undefined) return undefined
	const ref = findBranchRef({ root, branch: identity.branch })
	if (ref === undefined) return undefined
	const tip = tryReadGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
	})?.trim()
	if (tip === undefined || tip === '' || tip === identity.base.commit) return undefined
	// past its base: a branch reset behind its base never reads landed
	if (!isAncestorCommit({ root, ancestor: identity.base.commit, descendant: tip })) return undefined
	if (!isAncestorCommit({ root, ancestor: tip, descendant: target.ref })) return undefined
	return { entry, folder: entry.folder, target: target.branch }
}

/** The target branch of the probe, resolved at its first call and kept: a refusal is no target. */
function targetOf(params: {
	root: string
	packageJson: PackageJson
	resolution: LandedTargetResolution
}): LandedTarget | undefined {
	const { resolution } = params
	if (!resolution.resolved) {
		const found = findBaseBranchRef({ root: params.root, packageJson: params.packageJson })
		resolution.resolved = true
		resolution.target = 'refusal' in found ? undefined : found
	}
	return resolution.target
}

/**
 * What `readCheckedLotState` returns, plus `landed` when the lot's hand-over was committed outside its folder and its
 * branch is on the target branch (with the probe). Without the probe, the lot reads from its own records.
 */
export function readLandedLotState(
	params: LotStateReadParams & { probe?: LandedProbe },
): LandedLotState | undefined {
	const { probe, lotFolder } = params
	if (probe === undefined) return readCheckedLotState(params)
	// the registry read once: for the lot's own records and for the entries naming its worktree
	const entries = params.entries ?? readStoreEntries(params.registry)
	const checked = readCheckedLotState({ lotFolder, registry: params.registry, entries })
	if (checked === undefined || !('input' in checked)) return checked
	const { input } = checked
	if (input.registryEntry !== undefined) return checked
	// a lot its own records already close (canceled) keeps nothing: no landed reading, no probe
	const ownState = lotState(input).state
	if (LOTS_KEEPING_NOTHING.some((closed) => closed === ownState)) return checked
	// a closed entry is already read by readCheckedLotState (registryEntry set above): here only an open one
	const entry = committedElsewhereEntry({ entries, identity: input.identity, lotFolder })
	if (entry === undefined || entryDamageOf(entry) !== undefined || entry.closed !== undefined)
		return checked
	// a lot running or resumed after that hand-over reads from its own records: no probe
	if (isResumedAfterEntry({ entry, transitions: input.transitions, runMarker: input.runMarker }))
		return checked
	const landed = probe({ identity: input.identity, entry })
	if (landed === undefined) return checked
	return { input: { ...input, registryEntry: landed.entry }, landed }
}

/** The line that says why the lot reads committed. */
export function landedLineOf(params: { name: string; reading: LandedReading }): string {
	const { folder, target } = params.reading
	return landedLineFrom({ name: params.name, folder, target })
}

/** The line that says why the lot `name` reads committed, from the folder of its hand-over and the target branch. */
export function landedLineFrom(params: { name: string; folder: string; target: string }): string {
	return LANDED_LINE.replace('{name}', () => params.name)
		.replace('{folder}', () => params.folder)
		.replace('{target}', () => params.target)
}
