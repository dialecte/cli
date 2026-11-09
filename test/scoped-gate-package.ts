import { spawnSync } from 'node:child_process'
/** Scratch packages with a scoped gate step, and a recorder of the git commands a run spawns. */
import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { shellQuote } from '../src/lib/shell-quote.ts'
import {
	FEATURE_BRANCH,
	GIT_RECORDER_SCRIPT,
	SCOPED_STEP_SCRIPT,
} from './scoped-gate-package.constants.ts'
import { createScratchRepository, git, temporaryFolder, writeFiles } from './scratch-repository.ts'

import { onTestFinished, vi } from 'vitest'

import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { ScopedRun, ScopedStep } from './scoped-gate-package.types.ts'

/** A scoped step (its script and log in a folder of the test's own, outside every repository). */
export function createScopedStep(params: { name?: string; heavy?: boolean } = {}): ScopedStep {
	const folder = temporaryFolder('dialecte-scoped-step-')
	writeFiles({ root: folder, files: { 'step.sh': SCOPED_STEP_SCRIPT } })
	const log = join(folder, 'runs.log')
	const moveFile = join(folder, 'move-main-to')
	return {
		step: {
			name: params.name ?? 'scoped',
			run: `sh ${shellQuote(join(folder, 'step.sh'))} ${shellQuote(log)} ${shellQuote(moveFile)}`,
			counts: 'tests',
			scoped: true,
			...(params.heavy && { heavy: true }),
		},
		log,
		moveFile,
	}
}

/** What each run of the scoped step saw, in order. */
export function readScopedRuns(scoped: ScopedStep): ScopedRun[] {
	if (!existsSync(scoped.log)) return []
	return readFileSync(scoped.log, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map(function runOf(line) {
			const [base, tree] = line.split(' ')
			return { base, tree }
		})
}

/**
 * A repository on `main` holding a package with the given gate lists, then `feat/x` cut from `main` with one commit
 * (`src/a.ts` and `docs/notes.md`) and checked out: HEAD's merge-base with `main` is `main`'s first commit.
 */
export function createScopedPackage(params: {
	gate: { fast?: GateStep[]; full?: GateStep[]; release?: GateStep[] }
}): string {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: 'demo', scripts: {}, dialecte: { gate: params.gate } })}\n`,
		'.gitignore': 'node_modules\n',
	})
	git({ root, args: ['checkout', '-q', '-b', FEATURE_BRANCH] })
	writeFiles({ root, files: { 'src/a.ts': 'export {}\n', 'docs/notes.md': 'notes\n' } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: the work'] })
	return root
}

/** The empty tree's id, as git computes it. */
export function emptyTreeOf(root: string): string {
	return git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()
}

/**
 * From now until the test ends every `git` the cli (and the test) spawns appends its arguments to the log first:
 * answers a reader of that log. The real git runs behind it.
 */
export function recordGitCommands(): () => string[] {
	const folder = temporaryFolder('dialecte-git-recorder-')
	const log = join(folder, 'git.log')
	const real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
	writeFiles({
		root: folder,
		files: {
			git: GIT_RECORDER_SCRIPT.replace('{log}', shellQuote(log)).replace('{git}', shellQuote(real)),
		},
	})
	chmodSync(join(folder, 'git'), 0o755)
	vi.stubEnv('PATH', `${folder}:${process.env.PATH ?? ''}`)
	onTestFinished(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})
	return function spawned() {
		return existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []
	}
}
