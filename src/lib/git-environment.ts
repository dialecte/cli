/** Keeps the git commands the cli runs on the repository of the folder they are given. */
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

import { REPOSITORY_ENVIRONMENT_VARIABLES } from './git-environment.constants.ts'
import { readGit } from './git.ts'

/**
 * Deletes from `environment` the variables that point git at a repository (set by git for a hook,
 * or by the user): every git command the cli runs names its folder, and every child it starts
 * inherits the cleared environment. Returns the names that were set, in the list's order.
 */
export function clearRepositoryEnvironment(environment: NodeJS.ProcessEnv): string[] {
	const cleared = REPOSITORY_ENVIRONMENT_VARIABLES.filter((name) => environment[name] !== undefined)
	for (const name of cleared) delete environment[name]
	return cleared
}

/**
 * Whether the GIT_DIR or GIT_WORK_TREE `given` (the environment before clearing) names a repository
 * other than the one of `folder`: git sets GIT_DIR to the folder's own git folder for a hook of a
 * linked worktree, and GIT_PREFIX and GIT_INDEX_FILE for every hook, which the cli can drop without a
 * word. Asked of git after clearing, relative paths resolved against `folder` as git does.
 */
export function namesAnotherRepository(params: {
	given: NodeJS.ProcessEnv
	folder: string
}): boolean {
	const { given, folder } = params
	return (
		namesAnotherFolder({ value: given.GIT_DIR, folder, question: '--absolute-git-dir' }) ||
		namesAnotherFolder({ value: given.GIT_WORK_TREE, folder, question: '--show-toplevel' })
	)
}

/**
 * Whether a non-empty `value` names another folder than git's answer to `rev-parse <question>` in
 * `folder` (any value does when git has no answer there). Git is asked only for a value.
 */
function namesAnotherFolder(params: {
	value: string | undefined
	folder: string
	question: string
}): boolean {
	const { value, folder, question } = params
	if (!value) return false
	const own = askGit({ folder, args: ['rev-parse', question] })
	return own === undefined || !isSamePath({ first: resolve(folder, value), second: own })
}

/** Git's answer in `folder`, or undefined when it has none (not a repository, no work tree). */
function askGit(params: { folder: string; args: string[] }): string | undefined {
	try {
		return readGit({ root: params.folder, args: params.args }).trim()
	} catch {
		return undefined
	}
}

/** Two paths naming the same folder, symbolic links followed (`/tmp` and `/private/tmp`). */
function isSamePath(params: { first: string; second: string }): boolean {
	const { first, second } = params
	if (!existsSync(first) || !existsSync(second)) return first === second
	return realpathSync(first) === realpathSync(second)
}

/** The stderr line telling the user the repository variables they set are ignored. */
export function ignoredRepositoryEnvironmentLine(cleared: readonly string[]): string {
	return `dialecte: ${cleared.join(', ')} ignored: the cli acts on the folder it runs in`
}
