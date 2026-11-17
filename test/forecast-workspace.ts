/** A scratch workspace for the forecast: a repository with an origin, real lots started into its store, git stubs. */
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { startLot } from '../src/commands/lot-start.ts'
import { briefWith, createBriefWorkspace } from './brief-workspace.ts'
import { FORECAST_FILES, FORECAST_NOW, FORECAST_SCOPE } from './forecast-workspace.constants.ts'
import { cloneRepository, git, temporaryFolder, writeFiles } from './scratch-repository.ts'

import { vi } from 'vitest'

import type { ForecastTestLot, ForecastWorkspace } from './forecast-workspace.types.ts'

/**
 * A workspace whose repository holds `FORECAST_FILES` and has an origin (a clone of it) with `origin/main` and
 * `origin/HEAD`. The caller restores the environment (`vi.unstubAllEnvs`).
 */
export function createForecastWorkspace(): ForecastWorkspace {
	const brief = createBriefWorkspace()
	writeFiles({ root: brief.repository, files: { ...FORECAST_FILES } })
	git({ root: brief.repository, args: ['add', '-A'] })
	git({ root: brief.repository, args: ['commit', '-q', '-m', 'chore: forecast files'] })
	const origin = cloneRepository({
		origin: brief.repository,
		into: join(temporaryFolder('dialecte-forecast-origin-'), 'origin'),
	})
	git({ root: brief.repository, args: ['remote', 'add', 'origin', origin] })
	git({ root: brief.repository, args: ['fetch', '-q', 'origin'] })
	git({ root: brief.repository, args: ['remote', 'set-head', 'origin', 'main'] })
	return {
		workspace: brief.workspace,
		repository: realpathSync(brief.repository),
		origin,
		briefFolder: brief.briefFolder,
	}
}

/** Starts a lot of `feature` (scope `FORECAST_SCOPE`) from the workspace; throws when the start fails. */
export function startForecastLot(params: {
	workspace: ForecastWorkspace
	feature: string
}): ForecastTestLot {
	const { workspace, feature } = params
	const briefPath = join(workspace.briefFolder, `${feature}.json`)
	const brief = briefWith({
		feature,
		branch: `feat/${feature}`,
		scope: [...FORECAST_SCOPE],
		lots: [{ paths: [...FORECAST_SCOPE], message: `feat: ${feature}` }],
	})
	writeFileSync(briefPath, `${JSON.stringify(brief, null, 2)}\n`)
	const started = startLot({
		cwd: workspace.workspace,
		argv: [
			briefPath,
			'--overlap-ok',
			'--by',
			'reviewer',
			'--reason',
			'forecast test lots share src',
		],
		now: FORECAST_NOW,
	})
	if (started.exitCode !== 0) throw new Error(`lot start ${feature}: ${started.output}`)
	const name = /^(\S+) started$/m.exec(started.output)?.[1]
	const lotFolder = /^folder: (.+)$/m.exec(started.output)?.[1]
	const worktree = /^worktree: (.+)$/m.exec(started.output)?.[1]
	if (!name || !lotFolder || !worktree) throw new Error(`lot start ${feature}: ${started.output}`)
	return { name, lotFolder, worktree }
}

/** Writes `files` into the lot's worktree (uncommitted work); `commit` commits them on the lot's branch. */
export function workInLot(params: {
	lot: ForecastTestLot
	files: Record<string, string>
	commit?: boolean
}): void {
	writeFiles({ root: params.lot.worktree, files: params.files })
	if (!params.commit) return
	git({ root: params.lot.worktree, args: ['add', '-A'] })
	git({ root: params.lot.worktree, args: ['commit', '-q', '-m', 'feat: work'] })
}

/** A commit holding `files` on origin's main, fetched into the workspace's repository. */
export function commitOnMain(params: {
	workspace: ForecastWorkspace
	files: Record<string, string>
}): void {
	const { workspace } = params
	writeFiles({ root: workspace.origin, files: params.files })
	git({ root: workspace.origin, args: ['add', '-A'] })
	git({ root: workspace.origin, args: ['commit', '-q', '-m', 'feat: on main'] })
	git({ root: workspace.repository, args: ['fetch', '-q', 'origin'] })
}

/**
 * A `git` first on PATH for the rest of the test: `script` runs for the commands it matches, the real git for the
 * others. `script` is a shell fragment that sees the arguments as `$@`.
 */
export function stubGit(params: { script: string }): void {
	const folder = temporaryFolder('dialecte-git-stub-')
	const real = whichGit()
	mkdirSync(folder, { recursive: true })
	const stub = join(folder, 'git')
	writeFileSync(stub, `#!/bin/sh\n${params.script}\nexec "${real}" "$@"\n`)
	chmodSync(stub, 0o755)
	vi.stubEnv('PATH', `${folder}:${process.env.PATH ?? ''}`)
}

/** The first git on PATH. */
function whichGit(): string {
	for (const folder of (process.env.PATH ?? '').split(':')) {
		const candidate = join(folder, 'git')
		try {
			return realpathSync(candidate)
		} catch {
			// not in this folder
		}
	}
	return 'git'
}
