/**
 * A store lot held to its scope (SAFE 3.2-3.4): a brief workspace's repository whose package runs one counting `check`
 * step, main pushed to a bare origin, the lot on its own worktree and branch with one commit inside its scope, its
 * whole `brief.json` written by the store's own writer; after the cut, main moves on with a commit outside the scope.
 * Built as `landingLotOf` builds its lot, so the landing helpers take it.
 */
import { appendFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import { TEMPLATE_PATH } from '../src/lib/pr/change-request.constants.ts'
import { STORE_FILES, STORE_FOLDER } from '../src/lib/store/store.constants.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { replaceRecord } from './damaged-lot-workspace.ts'
import { writeLotsFile } from './handover-store-scenario.ts'
import { commitIn } from './landing-repository.ts'
import { startRealLot, writeLotHandover } from './lot-handover-workspace.ts'
import { cliTemplate } from './lot-pr.ts'
import { countingStep, createCounter, writeHandoverFolder } from './scratch-checks.ts'
import { createScratchRepository, git, temporaryFolder, writeFiles } from './scratch-repository.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { MergeLotPlan } from '../src/lib/handover/handover.types.ts'
import type { LandingLot } from './landing-lot.types.ts'
import type { LotHandoverWorkspace } from './lot-handover-workspace.types.ts'
import type { MergedBranch, OutsideFile, ScopeGuardLot } from './scope-guard-lot.types.ts'

/**
 * The lot `name` (`0001-repo-scoped` by default) on `.worktrees/<name>`, branch `branch` (`feat/scoped`), its brief's
 * scope `scope` (`src/in.ts`, `src/in/`, `docs/`), its first commit `lotFiles` (`src/in.ts`). Main holds the package,
 * `src/legacy.ts` (outside the scope), the pull request template and `baseFiles` at the cut, then `lib/base-only.ts`
 * (outside the scope) after it, on origin too, unless `baseHeld`. The caller restores the environment (`vi.unstubAllEnvs`).
 */
export function scopeGuardLotOf(
	params: {
		name?: string
		branch?: string
		scope?: string[]
		lotFiles?: Record<string, string>
		baseFiles?: Record<string, string>
		/** More of the package's `dialecte` block (its shared areas, a base branch). */
		dialecte?: Record<string, unknown>
		/**
		 * The package's folder in the repository (`pkg`): its `package.json` there, and the lot's identity naming that
		 * folder of its worktree as the worktree the hand-over runs in; the repository's top when left out.
		 */
		packageFolder?: string
		/** Main stays at the cut (a hand-over's target held); it moves on after the cut when left out. */
		baseHeld?: boolean
	} = {},
): ScopeGuardLot {
	const workspace = createBriefWorkspace()
	const root = workspace.repository
	const counter = createCounter()
	const cut = commitIn({
		root,
		files: {
			[join(params.packageFolder ?? '', 'package.json')]: manifestOf({
				counter,
				dialecte: params.dialecte,
			}),
			'src/legacy.ts': 'export const legacy = 1\n',
			// the pull request template a landing renders its text through
			[TEMPLATE_PATH]: cliTemplate(),
			...params.baseFiles,
		},
		message: 'chore: the package',
	})
	const origin = join(temporaryFolder('dialecte-scope-origin-'), 'origin.git')
	git({ root, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root, args: ['remote', 'add', 'origin', origin] })
	git({ root, args: ['push', '-q', '-u', 'origin', 'main'] })
	// the lot's own records are ignored, as a lot worktree's are
	appendFileSync(join(root, '.git', 'info', 'exclude'), '.dialecte/\n')
	const name = params.name ?? '0001-repo-scoped'
	const branch = params.branch ?? 'feat/scoped'
	const path = join(workspace.workspace, '.worktrees', name)
	git({ root, args: ['worktree', 'add', '-q', '-b', branch, path, 'main'] })
	const worktree = realpathSync(path)
	const tip = commitIn({
		root: worktree,
		files: params.lotFiles ?? { 'src/in.ts': 'export const inside = 1\n' },
		message: 'feat(scoped): inside',
	})
	const lotFolder = realpathSync(
		writeStoreLot({
			workspace: { ...workspace, commit: cut },
			name,
			scope: params.scope ?? ['src/in.ts', 'src/in/', 'docs/'],
			branch,
			worktree: join(worktree, params.packageFolder ?? ''),
			repository: root,
			base: { ref: 'main', commit: cut },
		}),
	)
	// main moves on after the cut, outside the lot's scope: a fork point read wrong names its file
	if (params.baseHeld !== true) {
		commitIn({
			root,
			files: { 'lib/base-only.ts': 'export const base = 1\n' },
			message: 'feat: base',
		})
		git({ root, args: ['push', '-q', 'origin', 'main'] })
	}
	return {
		workspace,
		name,
		lotFolder,
		branch,
		worktree,
		tip,
		root,
		counter,
		repository: { root, origin, worktree, branch, cut, tip },
	}
}

/** The package's `package.json`: its `gate --full` one counting `check` step, `dialecte` added to its block. */
export function manifestOf(params: {
	counter: string
	dialecte?: Record<string, unknown>
	version?: string
}): string {
	return `${JSON.stringify(
		{
			name: 'scoped',
			...(params.version !== undefined && { version: params.version }),
			dialecte: {
				gate: { full: [countingStep({ counter: params.counter, name: 'check' })] },
				...params.dialecte,
			},
		},
		null,
		'\t',
	)}\n`
}

/** Writes `files` in `root` and stages them (forced: a `.dialecte/` record is ignored). */
export function stageIn(params: { root: string; files: Record<string, string> }): void {
	writeFiles(params)
	git({ root: params.root, args: ['add', '-f', '--', ...Object.keys(params.files)] })
}

/** The lot's `brief.json` replaced whole by `text`, or removed when `text` is undefined: a damaged lot. */
export function damageBrief(params: { lot: ScopeGuardLot; text?: string }): void {
	const { lotFolder } = params.lot
	if (params.text === undefined) rmSync(join(lotFolder, STORE_FILES.brief), { force: true })
	else replaceRecord({ folder: lotFolder, name: STORE_FILES.brief, text: params.text })
}

/** `lot scope <lot> --add <path>` by a person from the main checkout; throws when it is refused. */
export function addToScope(params: { lot: ScopeGuardLot; path: string }): CommandResult {
	const added = runLot({
		cwd: params.lot.root,
		argv: [
			'scope',
			params.lot.name,
			'--add',
			params.path,
			'--by',
			'person-a',
			'--reason',
			'approved widening',
		],
	})
	if (added.exitCode !== 0)
		throw new Error(`the add of ${params.path} was refused: ${added.output}`)
	return added
}

/** The lot's `-verify` throwaway (`<lot worktree>-verify` on `<lot branch>-verify`, at the lot's tip): its real path. */
export function addVerifyThrowaway(lot: LandingLot): string {
	const path = `${lot.worktree}-verify`
	git({
		root: lot.repository.root,
		args: ['worktree', 'add', '-q', '-b', `${lot.branch}-verify`, path, lot.branch],
	})
	return realpathSync(path)
}

/**
 * A rehearsal's clone of the main checkout: `git clone --shared --no-checkout`, then its branch checked out at the
 * checkout's HEAD, as the rehearsal makes it; its real path.
 */
export function rehearsalCloneOf(params: { root: string; branch: string }): string {
	const clone = join(temporaryFolder('dialecte-scope-rehearsal-'), 'clone')
	// dialecte-allow raw-git-repository: the rehearsal's own clone form (`--shared`), given the scratch identity below
	git({ root: params.root, args: ['clone', '-q', '--shared', '--no-checkout', params.root, clone] })
	git({ root: clone, args: ['config', 'user.email', 'scratch@example.com'] })
	git({ root: clone, args: ['config', 'user.name', 'Scratch'] })
	git({ root: clone, args: ['config', 'commit.gpgsign', 'false'] })
	const head = git({ root: params.root, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root: clone, args: ['checkout', '-q', '-B', params.branch, head] })
	return realpathSync(clone)
}

/**
 * A branch `branch` cut at the lot's cut (a sibling of the lot, not the base's line) with one commit of `files`, made
 * in the main checkout, which goes back to main.
 */
export function commitSideBranch(params: {
	lot: ScopeGuardLot
	branch: string
	files: Record<string, string>
}): void {
	const { lot } = params
	git({ root: lot.root, args: ['checkout', '-q', '-b', params.branch, lot.repository.cut] })
	commitIn({ root: lot.root, files: params.files, message: `feat: ${params.branch}` })
	git({ root: lot.root, args: ['checkout', '-q', 'main'] })
}

/**
 * A store lot (a real `lot start`) whose hand-over is written into its folder, its own change pending beside a file
 * `src/outside.ts` outside the lot's scope: pending in `lots.json` (`pending`), or committed on the lot's branch with the
 * hook skipped and absent from `lots.json` (`committed`); none with `none`.
 */
export function outsideScopeHandover(params: { outside: OutsideFile }): LotHandoverWorkspace {
	const lot = startRealLot()
	const file = { 'src/outside.ts': 'export const outside = 1\n' }
	if (params.outside !== 'none') writeFiles({ root: lot.worktree, files: file })
	if (params.outside === 'committed') {
		git({ root: lot.worktree, args: ['add', '--', 'src/outside.ts'] })
		git({ root: lot.worktree, args: ['commit', '-q', '--no-verify', '-m', 'feat: outside'] })
	}
	const handover = { ...lot, lotsPath: writeLotsFile({ root: lot.worktree, name: 'outside' }) }
	writeLotHandover(handover)
	return handover
}

/**
 * A store lot of a package in the folder `packageFolder` of its repository (scope `<folder>/src/in.ts`,
 * `<folder>/src/in/`), whose hand-over is written into its folder from the package's folder: `lots.json` names the
 * package's files package-relative, `src/in/a.ts`, and `src/outside.ts` when `outside` is `pending`.
 */
export function packageFolderHandover(params: {
	packageFolder: string
	outside: Exclude<OutsideFile, 'committed'>
}): LotHandoverWorkspace {
	const { packageFolder } = params
	const lot = scopeGuardLotOf({
		packageFolder,
		baseHeld: true,
		scope: [`${packageFolder}/src/in.ts`, `${packageFolder}/src/in/`],
		lotFiles: { [`${packageFolder}/src/in.ts`]: 'export const inside = 1\n' },
	})
	const packageRoot = join(lot.worktree, packageFolder)
	writeFiles({
		root: packageRoot,
		files: {
			'src/in/a.ts': 'export const a = 1\n',
			...(params.outside === 'pending' && { 'src/outside.ts': 'export const outside = 1\n' }),
		},
	})
	const repository = realpathSync(lot.root)
	const handover: LotHandoverWorkspace = {
		start: {
			workspace: lot.workspace,
			repository,
			store: join(realpathSync(join(repository, '.git')), STORE_FOLDER),
			worktreesFolder: join(realpathSync(lot.workspace.workspace), '.worktrees'),
			cwd: lot.workspace.workspace,
		},
		lotName: lot.name,
		lotFolder: lot.lotFolder,
		worktree: packageRoot,
		lotsPath: writeLotsFile({ root: packageRoot, name: 'package' }),
	}
	writeLotHandover(handover)
	return handover
}

/**
 * A store lot's hand-over of one merge lot (its tree recorded, no conflict), the lot's scope the store scenarios' one
 * (`storeLotFolder`), and the repository's real path. `sibling`: the hand-over on `main` merges `feat/side`, cut from
 * main with `side-only.txt` (outside the scope). `base`: the hand-over on `feat/lot` merges `main`, moved on after the
 * cut with `main-only.txt` (outside the scope): a tip on the base line.
 */
export function mergeLotHandover(params: { merged: MergedBranch }): { root: string; out: string } {
	const root = realpathSync(createScratchRepository({ 'src/a.ts': 'export const a = 1\n' }))
	const sibling = params.merged === 'sibling'
	const branch = sibling ? 'feat/side' : 'main'
	git({ root, args: ['checkout', '-q', '-b', sibling ? 'feat/side' : 'feat/lot'] })
	if (sibling) commitIn({ root, files: { 'side-only.txt': 'side\n' }, message: 'feat: side' })
	git({ root, args: ['checkout', '-q', 'main'] })
	if (!sibling) {
		commitIn({ root, files: { 'main-only.txt': 'main\n' }, message: 'feat: main moves on' })
		git({ root, args: ['checkout', '-q', 'feat/lot'] })
	}
	const tip = git({ root, args: ['rev-parse', branch] }).trim()
	const mergeLot: MergeLotPlan = {
		kind: 'merge',
		branch,
		tip,
		resolved: {},
		message: `merge: bring ${branch} in`,
		tree: git({ root, args: ['merge-tree', '--write-tree', 'HEAD', branch] }).trim(),
	}
	const { out } = writeHandoverFolder({
		root,
		lots: [mergeLot],
		branch: sibling ? 'main' : 'feat/lot',
	})
	return { root, out }
}
