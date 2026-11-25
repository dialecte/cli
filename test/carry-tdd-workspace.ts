/**
 * A canceled lot whose tdd ledger is real (its red and its green were run) and the lot rebuilt from it with
 * `lot start --from`, both in worktrees of one vitest package: what the carry cases of `tdd red` start from.
 */
import { mkdirSync, symlinkSync } from 'node:fs'
import { basename, join } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import { runTdd } from '../src/commands/tdd.ts'
import { readIdentity } from '../src/lib/store/identity.ts'
import { briefWith } from './brief-workspace.ts'
import {
	CARRY_CANCELED,
	CARRY_NOW,
	CARRY_REBUILT_BRANCH,
	CARRY_REBUILT_FEATURE,
	SOURCE_TDD_START,
	SOURCE_TDD_STEP_MS,
	TDD_NOW,
} from './carry-workspace.constants.ts'
import { writeCarrySource } from './carry-workspace.ts'
import { createStartWorkspace, entriesOf } from './lot-start-workspace.ts'
import { git, writeFiles } from './scratch-repository.ts'
import { VITEST_FOLDER } from './scratch-vitest-package.constants.ts'

import type { CarryTddSource, RebuiltLot } from './carry-tdd-workspace.types.ts'

/** `tdd` in `cwd` as the lot's station runs it. */
export function tddIn(params: { cwd: string; argv: string[]; now?: Date }) {
	const now = params.now ?? TDD_NOW
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => now })
}

/** Links the cli's own vitest into a worktree, so that `npx --no-install vitest` runs there offline. */
function linkVitest(worktree: string): void {
	mkdirSync(join(worktree, 'node_modules', '.bin'), { recursive: true })
	symlinkSync(VITEST_FOLDER, join(worktree, 'node_modules', 'vitest'))
	symlinkSync(join('..', 'vitest', 'vitest.mjs'), join(worktree, 'node_modules', '.bin', 'vitest'))
}

/**
 * The workspace's repository on `main` holding a vitest package (whose hook runs one passing `check`) and `committed`,
 * a canceled source lot (`source`), and the lot `lot start --from` makes from it (a start without `--from` when
 * `from` is false), its worktree holding `rebuilt` and linked to vitest.
 */
export async function rebuiltLot(params: {
	committed?: Record<string, string>
	source: CarryTddSource
	/** The files the rebuilt lot's worktree starts with (the cherry-picked work). */
	rebuilt: Record<string, string>
	from?: boolean
}): Promise<RebuiltLot> {
	const workspace = createStartWorkspace({
		brief: briefWith({ branch: CARRY_REBUILT_BRANCH, feature: CARRY_REBUILT_FEATURE }),
	})
	const check = { name: 'check', run: 'true' }
	writeFiles({
		root: workspace.repository,
		files: {
			'package.json': `${JSON.stringify({
				name: 'demo',
				type: 'module',
				devDependencies: { vitest: '^4.1.8' },
				dialecte: { gate: { full: [check], hook: [check] } },
			})}\n`,
			'.gitignore': 'node_modules\n',
			...params.committed,
		},
	})
	git({ root: workspace.repository, args: ['add', '-A'] })
	git({
		root: workspace.repository,
		args: ['commit', '-q', '--no-verify', '-m', 'chore: a vitest package'],
	})
	const commit = git({ root: workspace.repository, args: ['rev-parse', 'HEAD'] }).trim()
	const start = { ...workspace, workspace: { ...workspace.workspace, commit } }
	const { source: work } = params
	const source = writeCarrySource({
		start,
		later: CARRY_CANCELED,
		...('canned' in work ? { declaration: work.declaration } : { ledger: 'none' as const }),
	})
	if (!('canned' in work)) {
		linkVitest(source.worktree)
		const steps =
			'steps' in work
				? work.steps
				: [
						{ run: 'red' as const, files: work.red },
						{ run: 'green' as const, files: work.green },
					]
		for (const [index, step] of steps.entries()) {
			writeFiles({ root: source.worktree, files: step.files })
			// each run of the source has its own time, never the rebuilt lot's
			const now = new Date(SOURCE_TDD_START.getTime() + index * SOURCE_TDD_STEP_MS)
			await tddIn({ cwd: source.worktree, argv: [step.run], now })
		}
	}
	runLot({
		cwd: start.cwd,
		argv: [
			'start',
			start.workspace.briefPath,
			...(params.from === false ? [] : ['--from', source.name]),
		],
		now: CARRY_NOW,
	})
	const [name] = entriesOf(start.store).filter((entry) => entry !== source.name)
	const lotFolder = join(start.store, name ?? 'no-started-lot')
	const worktree = readIdentity({ lotFolder })?.worktree ?? 'no-rebuilt-worktree'
	linkVitest(worktree)
	writeFiles({ root: worktree, files: params.rebuilt })
	return { start, source, lotFolder, worktree }
}

/**
 * A review throwaway of the rebuilt lot: a worktree of the same repository named `<lot>-round-<n>`, the name
 * `lotOfWorktree` maps to the lot, holding `files` and linked to vitest. It is not the lot's own worktree.
 */
export function reviewThrowawayOf(params: {
	lot: RebuiltLot
	files: Record<string, string>
}): string {
	const { lot } = params
	const throwaway = join(lot.start.worktreesFolder, `${basename(lot.lotFolder)}-round-1`)
	git({
		root: lot.start.repository,
		args: ['worktree', 'add', '-q', '-b', 'review/round-1', throwaway, lot.start.workspace.commit],
	})
	linkVitest(throwaway)
	writeFiles({ root: throwaway, files: params.files })
	return throwaway
}
