/** A scratch store lot for the `lot design` cases, the design file in its repository, and the reads the cases compare. */
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import { recordBaseDeclared } from '../src/lib/design/base-declared.ts'
import {
	appendDesignLine,
	designHashOf,
	writeDesignCopy,
} from '../src/lib/design/design-records.ts'
import { commonGitFolderOf } from '../src/lib/git.ts'
import { STORE_FILES, STORE_FOLDER } from '../src/lib/store/store.constants.ts'
import { writeStoreLot } from './brief-workspace.ts'
import {
	DECLARED_GLOB,
	DESIGN_PATH,
	DESIGN_TEXT,
	DESIGN_TIME,
	LANDING_LOT,
} from './design-workspace.constants.ts'
import { headOf, storeLotFolder, storeOf } from './handover-store-scenario.ts'
import { landingRepository } from './land-lot.ts'
import { createStationLot } from './lot-station-workspace.ts'
import { linkLot } from './lot-stores.ts'
import { countingStep, createCounter } from './scratch-checks.ts'
import { git, temporaryFolder, writeFiles } from './scratch-repository.ts'
import { createVitestPackage } from './scratch-vitest-package.ts'

import { vi } from 'vitest'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { DesignNeedReason } from '../src/lib/design/design.types.ts'
import type { DesignLot, GatedLot, LandingLot } from './design-workspace.types.ts'

/**
 * A working store lot (scope `src/`) whose repository holds the design at `DESIGN_PATH`; with `declared`, its
 * `package.json` declares `DECLARED_GLOB` a shared area, so the lot needs a design. The verbs run from the repository,
 * the main checkout: the lot's worktree is another folder.
 */
export function designLot(
	params: { declared?: boolean; state?: 'working' | 'committed' } = {},
): DesignLot {
	const lot = createStationLot({ state: params.state })
	writeFiles({
		root: lot.cwd,
		files: {
			[DESIGN_PATH]: DESIGN_TEXT,
			...(params.declared && { 'package.json': declaringManifest() }),
		},
	})
	isolateTemporaryFolders()
	return { ...lot, designFile: realpathSync(join(lot.cwd, DESIGN_PATH)) }
}

/**
 * Points the system's temporary folder (`TMPDIR`) and the cli's scratch root (`DIALECTE_SCRATCH`) at fresh folders, so
 * the files a case made before are in neither: a design there is accepted, one made after under them is refused. The
 * caller restores the environment (`vi.unstubAllEnvs`).
 */
export function isolateTemporaryFolders(): void {
	const temporary = temporaryFolder('design-tmp-')
	const scratch = temporaryFolder('design-scratch-')
	vi.stubEnv('TMPDIR', temporary)
	vi.stubEnv('DIALECTE_SCRATCH', scratch)
}

/**
 * A vitest package whose `package.json` declares `declared` shared areas and, with `hook`, a hook list of one counting
 * `check` step; its store lot (scope `src/`) has the package as its own worktree, linked. The design file sits in a
 * folder of its own, outside the package.
 */
export function gatedLot(params: { declared: readonly string[]; hook?: boolean }): GatedLot {
	const counter = createCounter()
	const check = countingStep({ counter, name: 'check' })
	const root = realpathSync(
		createVitestPackage({
			dialecte: {
				risk: { high: [...params.declared] },
				gate: { full: [check], ...(params.hook && { hook: [check] }) },
			},
		}),
	)
	const lotFolder = storeLotFolder({ root, name: 'gated' })
	linkLot({ worktree: root, lotFolder })
	// a folder of its own, made before the temporary folders are isolated: no other case writes there
	const designFile = join(temporaryFolder('design-plans-'), 'DESIGN.md')
	writeFileSync(designFile, DESIGN_TEXT)
	isolateTemporaryFolders()
	return { root, lotFolder, name: basename(lotFolder), counter, designFile }
}

/** Records the lot's design and an approval of it for `need`, written as `lot design` writes them. */
export function approvedDesign(params: {
	lot: Pick<GatedLot, 'lotFolder' | 'designFile'>
	need: DesignNeedReason[]
}): void {
	const { lot } = params
	const bytes = readFileSync(lot.designFile)
	const hash = designHashOf(bytes)
	writeDesignCopy({ lotFolder: lot.lotFolder, hash, text: bytes.toString('utf8') })
	appendDesignLine({
		lotFolder: lot.lotFolder,
		line: {
			schema: 1,
			kind: 'recorded',
			at: DESIGN_TIME.toISOString(),
			file: lot.designFile,
			hash,
			from: 'file',
		},
	})
	appendDesignLine({
		lotFolder: lot.lotFolder,
		line: {
			schema: 1,
			kind: 'approved',
			at: DESIGN_TIME.toISOString(),
			by: 'orchestrator',
			hash,
			need: params.need,
		},
	})
}

/** `lot design <lot's full name> <words...>` from `cwd` (the repository unless given), at `DESIGN_TIME`. */
export function design(params: { lot: DesignLot; words: string[]; cwd?: string }): CommandResult {
	return runLot({
		cwd: params.cwd ?? params.lot.cwd,
		argv: ['design', params.lot.name, ...params.words],
		now: DESIGN_TIME,
	})
}

/** The lines of the lot's `design.jsonl`, each read as JSON; none without the file. */
export function designLinesOf(lot: DesignLot): unknown[] {
	const file = join(lot.lotFolder, STORE_FILES.design)
	if (!existsSync(file)) return []
	return readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map(function lineOf(line) {
			return JSON.parse(line)
		})
}

/** The names of the lot folder's design copies, sorted; none without the folder. */
export function designCopiesOf(lot: DesignLot): string[] {
	const folder = join(lot.lotFolder, STORE_FILES.designCopies)
	return existsSync(folder) ? readdirSync(folder).sort() : []
}

/** The text of a design copy. */
export function designCopyText(params: { lot: DesignLot; name: string }): string {
	return readFileSync(join(params.lot.lotFolder, STORE_FILES.designCopies, params.name), 'utf8')
}

/**
 * Commits a `package.json` declaring `DECLARED_GLOB` in the lot's repository, records it as the lot's base snapshot,
 * then writes the repository's working `package.json` without it: a main checkout (or a worktree) whose files no
 * longer hold an area its base declares. Returns the commit.
 */
export function baseDeclaringLot(lot: DesignLot): string {
	writeFiles({ root: lot.cwd, files: { 'package.json': declaringManifest() } })
	git({ root: lot.cwd, args: ['add', 'package.json'] })
	git({ root: lot.cwd, args: ['commit', '-qm', 'chore: declare the shared area'] })
	const commit = git({ root: lot.cwd, args: ['rev-parse', 'HEAD'] }).trim()
	recordBaseDeclared({ lotFolder: lot.lotFolder, root: lot.cwd, ref: commit })
	writeFiles({
		root: lot.cwd,
		files: { 'package.json': `${JSON.stringify({ name: 'scratch' })}\n` },
	})
	return commit
}

/** A `package.json` declaring `DECLARED_GLOB` a shared area. */
export function declaringManifest(): string {
	return `${JSON.stringify({ name: 'scratch', dialecte: { risk: { high: [DECLARED_GLOB] } } })}\n`
}

/**
 * A landing repository (main pushed to a bare origin, the lot's worktree on `feat/x` one commit ahead) whose store
 * holds the lot `0001-repo-x` (scope `src/`) with that worktree; the design file beside the repository.
 */
export function landingLot(): LandingLot {
	const repository = landingRepository()
	const { root } = repository
	const lotFolder = writeStoreLot({
		workspace: {
			workspace: root,
			repository: root,
			briefFolder: root,
			briefPath: join(root, 'brief.json'),
			store: join(commonGitFolderOf(root), STORE_FOLDER),
			registry: storeOf(root),
			commit: headOf(root),
			storeList: join(root, 'lot-stores'),
		},
		name: LANDING_LOT,
		scope: ['src/'],
		branch: 'feat/x',
		repository: root,
		worktree: repository.worktree,
		brief: { lots: [{ paths: ['src/x.ts'], message: 'feat(x): x answers one' }] },
	})
	const designFile = join(dirname(root), 'DESIGN.md')
	writeFileSync(designFile, DESIGN_TEXT)
	isolateTemporaryFolders()
	return { ...repository, lotFolder: realpathSync(lotFolder), name: LANDING_LOT, designFile }
}
