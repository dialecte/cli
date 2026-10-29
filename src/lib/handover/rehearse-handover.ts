/**
 * `handover run <folder> --rehearse`: the run on a scratch clone that looks like the person's tree - the
 * repository at HEAD, the current working tree on top, the hooks folder, a copy-on-write copy of
 * `node_modules` - so the hooks run as they will for real. The guards read the repository; the lots are
 * committed in the clone, which is removed at the end unless kept.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

import { readHooksFolder } from '../git-hooks.ts'
import { listChangedFiles, readGit, readGitConfig } from '../git.ts'
import { copyNodeModules } from '../worktree/copy-node-modules.ts'
import { REHEARSAL_FOLDER_PREFIX, REHEARSAL_MARKER_FILE } from './handover.constants.ts'
import { runHandoverFolder } from './run-handover-folder.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { HandoverFolder, WriteLine } from './handover.types.ts'

export async function rehearseHandover(params: {
	handover: HandoverFolder
	write: WriteLine
	clock: Clock
	colour: boolean
	/** The folder the clone is made in: the system's temporary folder. */
	scratchRoot: string
	keep: boolean
}): Promise<number> {
	const { handover, write } = params
	const repository = handover.lotsFile.repository
	const clone = mkdtempSync(join(params.scratchRoot, REHEARSAL_FOLDER_PREFIX))
	write(`rehearsal in ${clone}`)
	let hookGroup: number | undefined
	function interrupted(signal: NodeJS.Signals): void {
		if (hookGroup !== undefined) stopProcessGroup(hookGroup)
		rmSync(clone, { recursive: true, force: true })
		write(`interrupted (${signal}): the hook stopped, the rehearsal clone removed`)
		process.exit(signal === 'SIGINT' ? 130 : 143)
	}
	process.once('SIGINT', interrupted)
	process.once('SIGTERM', interrupted)
	try {
		prepareClone({ repository, clone, branch: handover.lotsFile.branch, write })
		return await runHandoverFolder({
			handover,
			commitRoot: clone,
			write,
			clock: params.clock,
			colour: params.colour,
			onProcessGroup: (pid) => {
				hookGroup = pid
			},
		})
	} finally {
		process.removeListener('SIGINT', interrupted)
		process.removeListener('SIGTERM', interrupted)
		if (params.keep) write(`kept the rehearsal clone: ${clone}`)
		else {
			rmSync(clone, { recursive: true, force: true })
			write('removed the rehearsal clone')
		}
	}
}

/** Stops a process group (the commit and its hook's children); a group already gone is fine. */
function stopProcessGroup(pid: number): void {
	try {
		process.kill(-pid, 'SIGTERM')
	} catch {
		// the group ended already
	}
}

function prepareClone(params: {
	repository: string
	clone: string
	branch: string
	write: WriteLine
}): void {
	const { repository, clone, write } = params
	const head = readGit({ root: repository, args: ['rev-parse', 'HEAD'] }).trim()
	readGit({
		root: dirname(clone),
		args: ['clone', '-q', '--shared', '--no-checkout', repository, clone],
	})
	readGit({ root: clone, args: ['checkout', '-q', '-B', params.branch, head] })
	writeFileSync(
		join(clone, '.git', REHEARSAL_MARKER_FILE),
		`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
	)
	for (const key of ['user.name', 'user.email', 'commit.gpgsign']) {
		const value = readGitConfig({ root: repository, key })
		if (value !== undefined) readGit({ root: clone, args: ['config', key, value] })
	}

	const changed = listChangedFiles({ root: repository, withDeleted: true })
	for (const file of changed) {
		const source = join(repository, file)
		const target = join(clone, file)
		if (existsSync(source)) {
			mkdirSync(dirname(target), { recursive: true })
			cpSync(source, target)
		} else rmSync(target, { force: true })
	}
	write(`  working tree: ${changed.length} changed file(s) on top of ${head.slice(0, 12)}`)

	const hooks = readHooksFolder(repository)
	if (hooks.configured && isAbsolute(hooks.configured))
		readGit({ root: clone, args: ['config', 'core.hooksPath', hooks.configured] })
	else if (hooks.configured) {
		if (existsSync(hooks.folder))
			cpSync(hooks.folder, join(clone, hooks.configured), { recursive: true })
		readGit({ root: clone, args: ['config', 'core.hooksPath', hooks.configured] })
	} else if (existsSync(hooks.folder))
		cpSync(hooks.folder, join(clone, '.git', 'hooks'), { recursive: true })
	write(`  hooks: ${hooks.configured ?? 'git hooks folder'} copied`)

	const nodeModules = join(repository, 'node_modules')
	if (existsSync(nodeModules)) {
		const copy = copyNodeModules({ from: nodeModules, to: join(clone, 'node_modules') })
		write(
			`  node_modules: ${copy.method}${copy.relinked.length ? `, ${copy.relinked.length} link(s) re-pointed` : ''}`,
		)
	}
	spawnSync('git', ['update-index', '-q', '--refresh'], { cwd: clone })
}
