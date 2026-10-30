/**
 * `handover run <folder> --rehearse`: the run on a scratch clone that looks like the person's tree - the
 * repository at HEAD, the current working tree on top, the hooks folder, a copy-on-write copy of
 * `node_modules` - so the hooks run as they will for real. The guards read the repository; the lots are
 * committed in the clone, which is removed at the end unless kept.
 */
import { spawnSync } from 'node:child_process'
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { constants } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

import { readHooksFolder } from '../git-hooks.ts'
import { listChangedFiles, readGit, readGitConfig } from '../git.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { stopLiveGroups } from '../progress/interrupt-forwarding.ts'
import { FORWARDED_SIGNALS } from '../progress/progress.constants.ts'
import { createStepProgress } from '../progress/step-progress.ts'
import { copyNodeModules } from '../worktree/copy-node-modules.ts'
import {
	REHEARSAL_FOLDER_PREFIX,
	REHEARSAL_MARKER_FILE,
	UNTRACKED_WARNING_LIMIT,
} from './handover.constants.ts'
import { runHandoverFolder } from './run-handover-folder.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { StepProgress } from '../progress/step-progress.types.ts'
import type { HandoverFolder, WriteLine } from './handover.types.ts'

export async function rehearseHandover(params: {
	handover: HandoverFolder
	write: WriteLine
	clock: Clock
	colour: boolean
	/** The folder the clone is made in: the system's temporary folder. */
	scratchRoot: string
	keep: boolean
	/** Where the clone and each lot announce themselves; default: start and running lines through `write`. */
	progress?: StepProgress
	/** The progress draws on a terminal. */
	tty?: boolean
	/** The terminal's width: the card wraps to it. */
	columns?: number
	/** The cli running the rehearsal, named by the card's run line when the repository's own cannot run it. */
	cliPath?: string
}): Promise<number> {
	const { handover, write } = params
	const progress =
		params.progress ??
		createStepProgress({
			live: { tty: false, writeLine: write, rewriteLines: () => undefined },
			clock: params.clock,
		})
	const repository = handover.lotsFile.repository
	const clone = mkdtempSync(join(params.scratchRoot, REHEARSAL_FOLDER_PREFIX))
	write(`rehearsal in ${clone}`)
	/** The hook's process group is stopped first (SIGKILL after its grace), then the clone goes. */
	function interrupted(signal: NodeJS.Signals): void {
		void stopLiveGroups(signal).then(function cleanUp() {
			rmSync(clone, { recursive: true, force: true })
			write(`interrupted (${signal}): the hook stopped, the rehearsal clone removed`)
			process.exit(128 + constants.signals[signal])
		})
	}
	// `on`, not `once`: the child's forwarding sees this listener and leaves the exit to it
	for (const signal of FORWARDED_SIGNALS) process.on(signal, interrupted)
	try {
		const unseen = untrackedOutsideLots(handover)
		if (unseen.length)
			write(
				`warning: untracked file(s) a hook could read in the repository, absent from the rehearsal clone (list them in .gitignore or .git/info/exclude): ${shortList(unseen)}`,
			)
		const startedAt = params.clock.now()
		const running = progress.start({
			name: 'rehearsal clone',
			...(params.tty && { detail: 'the repository, your working tree, hooks, node_modules' }),
		})
		try {
			prepareClone({ repository, clone, branch: handover.lotsFile.branch, write })
		} catch (error) {
			running.finish('✗ rehearsal clone')
			throw error
		}
		running.finish(`✓ rehearsal clone  ${formatDuration(params.clock.now() - startedAt)}`)
		return await runHandoverFolder({
			handover,
			commitRoot: clone,
			write,
			clock: params.clock,
			colour: params.colour,
			progress,
			tty: params.tty,
			columns: params.columns,
			cliPath: params.cliPath,
		})
	} finally {
		for (const signal of FORWARDED_SIGNALS) process.off(signal, interrupted)
		if (params.keep) write(`kept the rehearsal clone: ${clone}`)
		else {
			rmSync(clone, { recursive: true, force: true })
			write('removed the rehearsal clone')
		}
	}
}

/**
 * Untracked files outside .gitignore and .git/info/exclude that no lot commits: a hook may read them. A
 * folder untracked as a whole holding several files is one entry (`scratch/`); one holding a single file
 * is that file.
 */
function untrackedOutsideLots(handover: HandoverFolder): string[] {
	const root = handover.lotsFile.repository
	const committed = handover.lots.flatMap((lot) => [...lot.files, ...lot.deletedFiles])
	const files = readGit({ root, args: ['ls-files', '--others', '--exclude-standard'] })
		.split('\n')
		.filter((file) => file && !committed.includes(file))
	return readGit({ root, args: ['ls-files', '--others', '--exclude-standard', '--directory'] })
		.split('\n')
		.flatMap(function entriesOf(entry) {
			if (!entry.endsWith('/')) return files.includes(entry) ? [entry] : []
			const inside = files.filter((file) => file.startsWith(entry))
			return inside.length > 1 ? [entry] : inside
		})
}

/** The first entries, then how many more: a warning stays one short line. */
function shortList(entries: readonly string[]): string {
	const shown = entries.slice(0, UNTRACKED_WARNING_LIMIT).join(', ')
	const more = entries.length - UNTRACKED_WARNING_LIMIT
	return more > 0 ? `${shown} and ${more} more` : shown
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
		} else {
			rmSync(target, { force: true })
			removeEmptiedFolders({ clone, folder: dirname(target) })
		}
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

/** A deleted file's folder, and each parent up to the clone, removed while empty: as git leaves the tree. */
function removeEmptiedFolders(params: { clone: string; folder: string }): void {
	for (
		let folder = params.folder;
		folder !== params.clone && folder.startsWith(params.clone) && existsSync(folder);
		folder = dirname(folder)
	) {
		if (readdirSync(folder).length) return
		rmdirSync(folder)
	}
}
