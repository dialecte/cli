/** One git step of the forecast, bounded by its time limit: a step over the limit is killed and reads as over time. */
import { spawnSync } from 'node:child_process'

import { clearRepositoryEnvironment } from '../git-environment.ts'
import { GIT_READ_ENVIRONMENT } from '../git.constants.ts'

import type { BoundedGitResult } from './forecast.types.ts'

/**
 * Runs git in `root` with `args`, killed (SIGKILL) once it runs over `limitMs`. The repository variables a hook sets
 * (GIT_DIR, GIT_INDEX_FILE, ...) are cleared first, so the step reads the repository of `root`; `environment` is set
 * over the result (the snapshot's index copy and identity). Never throws.
 */
export function runBoundedGit(params: {
	root: string
	args: readonly string[]
	limitMs: number
	environment?: Readonly<Record<string, string>>
}): BoundedGitResult {
	const environment: NodeJS.ProcessEnv = { ...process.env }
	clearRepositoryEnvironment(environment)
	const result = spawnSync('git', ['-c', 'core.quotePath=false', ...params.args], {
		cwd: params.root,
		encoding: 'utf8',
		maxBuffer: 1e8,
		timeout: params.limitMs,
		killSignal: 'SIGKILL',
		env: { ...environment, ...GIT_READ_ENVIRONMENT, ...params.environment },
	})
	const code = (result.error as NodeJS.ErrnoException | undefined)?.code
	return {
		status: result.status,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? (result.error ? result.error.message : ''),
		timedOut: code === 'ETIMEDOUT',
	}
}

/** The first line of a failed step's message: its standard error, else its output, else its exit. */
export function firstLineOf(result: BoundedGitResult): string {
	const text = (result.stderr || result.stdout).trim()
	return text === '' ? `exit ${String(result.status)}` : (text.split('\n')[0] ?? '')
}
