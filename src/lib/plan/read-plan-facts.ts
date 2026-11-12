/**
 * The facts `plan next` reads from disk, once and from files only: each repository's store lots, hand-over registry
 * and linked worktrees, the status of each spec, the plan's marks. The only git processes: the landed probe's, run
 * only for a lot whose hand-over was committed outside its folder and not closed yet.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { readStoreEntries } from '../handover/handover-store-read.ts'
import {
	LINKED_WORKTREE_GITDIR_FILE,
	LINKED_WORKTREES_FOLDER,
	STORE_ENTRY_EXTENSION,
} from '../handover/handover.constants.ts'
import { readPackageJson } from '../package-json.ts'
import { probeCaseInsensitive } from '../store/brief.ts'
import { createLandedProbe, readLandedLotState } from '../store/lot-entry.ts'
import { isOpenRealLot, readLotScope, settledLotStateInput } from '../store/lot-records.ts'
import { lotState } from '../store/lot-state.ts'
import { listLotIdentities, locateStore } from '../store/store-folder.ts'
import { STORE_FILES, TEMPORARY_FOLDER_PATTERN } from '../store/store.constants.ts'
import { mainCheckoutFaultOf } from './check-plan-block.ts'
import { readPlanMarks } from './plan-marks.ts'
import {
	BRANCH_HEAD_PATTERN,
	LINKED_WORKTREE_HEAD_FILE,
	SPEC_DRAFT_STATUS,
	SPEC_EMPHASIS_PATTERN,
	SPEC_STATUS_PREFIX,
} from './plan.constants.ts'

import type { LandedProbe } from '../store/lot-entry.types.ts'
import type { StoreLocation } from '../store/store.types.ts'
import type {
	DamagedRecord,
	FactsRead,
	PlanFacts,
	PlanLandedLot,
	ReadPlanFactsParams,
	RegistryFact,
	RepositoryFacts,
	SpecStatus,
	StoreLotFact,
	WorktreeFact,
} from './plan.types.ts'

/**
 * The facts of a block read once, from files only: each repository's store lots, registry entries and worktrees,
 * the status of each spec file, the plan's marks. A repository that cannot be read is `readable: false`.
 */
export function readPlanFacts(params: ReadPlanFactsParams): PlanFacts {
	const { block } = params
	return {
		repositories: Object.fromEntries(
			Object.entries(block.repositories).map(([name, path]) => [
				name,
				readRepositoryFacts({ path }),
			]),
		),
		specs: Object.fromEntries(
			block.lots.flatMap((entry) =>
				entry.spec === undefined
					? []
					: [[entry.spec, specStatusOf({ text: readTextOf({ path: entry.spec }) })]],
			),
		),
		briefs: Object.fromEntries(
			block.lots.flatMap((entry) =>
				entry.brief === undefined ? [] : [[entry.brief, isFile({ path: entry.brief })]],
			),
		),
		marks:
			params.planPath === undefined
				? []
				: readPlanMarks({ planPath: params.planPath, location: params.stateLocation }),
	}
}

/**
 * The status of a spec from its text (undefined: no file): the first line starting with `Status:` decides, its
 * emphasis (`**`, `*`, `_`) stripped; a status starting with DRAFT, or no such line, is DRAFT, any other is written.
 * Pure.
 */
export function specStatusOf(params: { text: string | undefined }): SpecStatus {
	if (params.text === undefined) return { status: 'missing', line: undefined }
	const line = params.text
		.split(/\r?\n/)
		.find((candidate) => candidate.startsWith(SPEC_STATUS_PREFIX))
	if (line === undefined) return { status: 'DRAFT', line: undefined }
	const status = line
		.slice(SPEC_STATUS_PREFIX.length)
		.replace(SPEC_EMPHASIS_PATTERN, '')
		.trimStart()
	return { status: status.startsWith(SPEC_DRAFT_STATUS) ? 'DRAFT' : 'written', line }
}

/** One repository read by its own `.git`: readable with its records, or why not (never a throw). */
function readRepositoryFacts(params: { path: string }): RepositoryFacts {
	const { path } = params
	const fault = mainCheckoutFaultOf({ path })
	if (fault !== undefined) return { readable: false, path, reason: fault }
	const location = locateStore({ from: path })
	if (location === undefined)
		return { readable: false, path, reason: `${path} is not a git main checkout` }
	try {
		const storeLots = readStoreLotFacts({ location, probe: landedProbeOf({ root: path }) })
		const registry = readRegistryFacts({ location })
		const worktrees = readWorktreeFacts({ common: location.common })
		return {
			readable: true,
			path,
			common: location.common,
			caseInsensitive: probeCaseInsensitive({ path }),
			storeLots: storeLots.facts,
			registry: registry.facts,
			worktrees: worktrees.facts,
			damaged: [...storeLots.damaged, ...registry.damaged, ...worktrees.damaged],
		}
	} catch (error) {
		return {
			readable: false,
			path,
			reason: `${location.common} cannot be read: ${(error as Error).message}`,
		}
	}
}

/**
 * The lots of the repository's store, by name. A lot whose records do not hold (damaged) reads `failed`, open
 * unless simulated: the conservative side, its scope stays held. Damaged, besides: a lot folder whose identity
 * does not read (the shared reader leaves it out), an open lot whose state does not read or whose brief gives no
 * scope.
 */
function readStoreLotFacts(params: {
	location: StoreLocation
	/** The landed probe of the repository: run only for a lot whose hand-over was committed outside its folder. */
	probe: LandedProbe | undefined
}): FactsRead<StoreLotFact> {
	const { store, registry } = params.location
	const entries = readStoreEntries(registry)
	const identities = listLotIdentities({ store })
	const listed = new Set(identities.map((lot) => lot.name))
	const damaged: DamagedRecord[] = listFolderNames({ folder: store })
		.filter((name) => !TEMPORARY_FOLDER_PATTERN.test(name) && !listed.has(name))
		.map((name) => ({ kind: 'store', name, file: join(store, name, STORE_FILES.identity) }))
	const facts = identities.map(function storeLotFactOf({ name, identity }): StoreLotFact {
		const lotFolder = join(store, name)
		const checked = readLandedLotState({ lotFolder, registry, entries, probe: params.probe })
		const first = checked !== undefined && 'input' in checked ? checked.input : undefined
		const landed = checked?.landed
		// a landed reading's committed entry is never a marker-only cancel: the settle hands it back as it is
		const input =
			first && !first.identity.simulated
				? settledLotStateInput({ input: first, lotFolder, registry })
				: first
		const open = input === undefined ? !identity.simulated : isOpenRealLot(input)
		const scope = readLotScope({ lotFolder })
		if (open && input === undefined) damaged.push({ kind: 'store', name, file: lotFolder })
		else if (open && scope.length === 0)
			damaged.push({ kind: 'store', name, file: join(lotFolder, STORE_FILES.brief) })
		return {
			name,
			branch: identity.branch,
			feature: identity.feature,
			state: input === undefined ? 'failed' : lotState(input).state,
			open,
			scope,
			worktree: identity.worktree,
			// named until `lot close` closes the hand-over the reading picked
			...(landed !== undefined &&
				landed.entry.closed === undefined && {
					landed: { folder: landed.folder, target: landed.target },
				}),
		}
	})
	return { facts, damaged }
}

/**
 * The landed probe of the repository at `root` (its main checkout), its target branch from its package.json; none
 * when that file does not parse: every lot then reads from its own records.
 */
function landedProbeOf(params: { root: string }): LandedProbe | undefined {
	try {
		return createLandedProbe({ root: params.root, packageJson: readPackageJson(params.root) })
	} catch {
		return undefined
	}
}

/** The landed lots of every readable repository of the facts, in the block's repository order. Pure. */
export function landedLotsOf(params: { facts: PlanFacts }): PlanLandedLot[] {
	return Object.entries(params.facts.repositories).flatMap(([repository, facts]) =>
		facts.readable
			? facts.storeLots.flatMap((lot) =>
					lot.landed === undefined ? [] : [{ repository, lot: lot.name, ...lot.landed }],
				)
			: [],
	)
}

/**
 * The entries of the repository's hand-over registry, by name; a folder is kept as written (it may be gone). A
 * `*.json` the shared reader leaves out (it does not parse) is damaged.
 */
function readRegistryFacts(params: { location: StoreLocation }): FactsRead<RegistryFact> {
	const { registry } = params.location
	const facts = readStoreEntries(registry).map((entry) => ({
		name: entry.name,
		folder: entry.folder,
		branch: entry.branch,
		worktree: entry.worktree,
		written: entry.written,
		state: entry.state,
	}))
	const listed = new Set(facts.map((entry) => entry.name))
	const damaged = listFileNames({ folder: registry })
		.filter((file) => file.endsWith(STORE_ENTRY_EXTENSION))
		.filter((file) => !listed.has(file.slice(0, -STORE_ENTRY_EXTENSION.length)))
		.map((file): DamagedRecord => ({
			kind: 'registry',
			name: file.slice(0, -STORE_ENTRY_EXTENSION.length),
			file: join(registry, file),
		}))
	return { facts, damaged }
}

/**
 * The linked worktrees of `<common>/worktrees/<name>/`, by name: the folder its `gitdir` names, the branch its
 * `HEAD` holds (none when detached). A record without a readable `gitdir` or `HEAD` is damaged.
 */
function readWorktreeFacts(params: { common: string }): FactsRead<WorktreeFact> {
	const folder = join(params.common, LINKED_WORKTREES_FOLDER)
	const damaged: DamagedRecord[] = []
	const facts = listFolderNames({ folder }).flatMap(function worktreeFactOf(name): WorktreeFact[] {
		const record = join(folder, name)
		const gitdirFile = join(record, LINKED_WORKTREE_GITDIR_FILE)
		const headFile = join(record, LINKED_WORKTREE_HEAD_FILE)
		const gitdir = readTextOf({ path: gitdirFile })?.trim()
		const head = readTextOf({ path: headFile })?.trim()
		if (gitdir === undefined || gitdir === '' || head === undefined) {
			damaged.push({
				kind: 'worktree',
				name,
				file: gitdir === undefined || gitdir === '' ? gitdirFile : headFile,
			})
			return []
		}
		return [
			{
				name,
				path: dirname(resolve(record, gitdir)),
				branch: BRANCH_HEAD_PATTERN.exec(head)?.[1],
			},
		]
	})
	return { facts, damaged }
}

/** The file names of `folder`, sorted; none when it does not exist. */
function listFileNames(params: { folder: string }): string[] {
	try {
		return readdirSync(params.folder, { withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name)
			.sort()
	} catch {
		return []
	}
}

/** The folder names of `folder`, sorted; none when it does not exist. */
function listFolderNames(params: { folder: string }): string[] {
	try {
		return readdirSync(params.folder, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort()
	} catch {
		return []
	}
}

/** The path names an existing file (a folder or nothing is not one). */
function isFile(params: { path: string }): boolean {
	try {
		return statSync(params.path).isFile()
	} catch {
		return false
	}
}

/** The text of a file, undefined when it cannot be read. */
function readTextOf(params: { path: string }): string | undefined {
	try {
		return readFileSync(params.path, 'utf8')
	} catch {
		return undefined
	}
}
