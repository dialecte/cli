/**
 * Commits the lots not committed yet, one after the other: each lot announced before its work (`▶ lot
 * n/N` with its files and subject, or on a terminal a spinner naming it), the commit's hook output never
 * buffered - streamed behind a prefix off a terminal, its last lines live under the spinner on one - then
 * the path of the hook's full log (on a terminal, on success, the hook lines collapse to that one line;
 * on failure every line is kept), the commit's sha and stat. A lot whose commit fails is unstaged again
 * (a merge lot's merge aborted), so the same command resumes at it once the cause is fixed. A merge lot
 * merges its recorded tip with its resolutions, checked against what was reviewed and rehearsed. Before
 * any commit that stages a change of the lock, `node_modules` are brought to it. A commit whose hook
 * prints nothing and gains no CPU for the stall time is stopped: its process tree is printed, then
 * killed, and the lot is not committed.
 */
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { readGit } from '../git.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { HEARTBEAT_INTERVAL_MILLISECONDS } from '../progress/progress.constants.ts'
import { stallReason } from '../progress/stall-reason.ts'
import { createStepProgress } from '../progress/step-progress.ts'
import { streamCommand } from '../progress/stream-command.ts'
import {
	HOOK_HEARTBEAT_LABEL,
	HOOK_LOG_FOLDER_PREFIX,
	HOOK_OUTPUT_PREFIX,
} from './handover.constants.ts'
import { removeMergeMarker, runMergeLot, undoMerge } from './merge-lot.ts'
import { syncNodeModules } from './sync-node-modules.ts'
import { unstageLot } from './unstage-lot.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { StepProgress } from '../progress/step-progress.types.ts'
import type { Installer, ResolvedLot, WriteLine } from './handover.types.ts'

/** The commit of every lot committed, the first lot first; undefined when a commit failed (its lines written). */
export async function commitLots(params: {
	/** Where to commit: the repository, or a rehearsal clone of it. */
	root: string
	lots: readonly ResolvedLot[]
	/** The commits of the lots committed before this run. */
	commits: readonly string[]
	write: WriteLine
	clock: Clock
	/** Each commit runs in a process group of its own, its pid given here (a rehearsal stops it on an interrupt). */
	onProcessGroup?: (pid: number) => void
	/** Where each lot announces itself; default: start and running lines through `write`. */
	progress?: StepProgress
	/** The progress draws on a terminal: the hook's lines show live under the spinner. */
	tty?: boolean
	/** Brings `node_modules` to a staged lock that changed; default: `npm install`. */
	install?: Installer
}): Promise<string[] | undefined> {
	const { root, lots, write, clock } = params
	const tty = params.tty ?? false
	const progress =
		params.progress ??
		createStepProgress({
			live: { tty: false, writeLine: write, rewriteLines: () => undefined },
			clock,
		})
	const commits = [...params.commits]
	for (const [index, lot] of lots.entries()) {
		if (index < commits.length) continue
		const number = index + 1
		const paths = [...lot.files, ...lot.deletedFiles].sort()
		const subject = lot.message.trim().split('\n')[0]
		// off a terminal the hook's lines, streamed under the start line, say what runs
		const running = progress.start({
			name: lot.merge
				? `lot ${number}/${lots.length}  merge ${lot.merge.branch} at ${lot.merge.tip.slice(0, 12)}  ${subject}`
				: `lot ${number}/${lots.length}  ${paths.length} file(s)  ${subject}`,
			...(tty && { detail: 'git commit and its hook' }),
			hintWhenSilent: true,
		})
		const startedAt = clock.now()
		/** Puts the repository back as before the lot: the merge aborted, or the lot's files unstaged. */
		function undo(): string {
			if (lot.merge) return undoMerge({ root, number })
			const unstaged = unstageLot({ root, paths, clock })
			return unstaged.unstaged
				? `    its files are unstaged again, nothing else changed; fix the cause, then run the same command: it resumes at lot ${number}`
				: stillStaged({ unstaged, lot: number })
		}
		if (lot.merge) {
			const prepared = runMergeLot({ root, merge: lot.merge })
			if ('refusal' in prepared) {
				running.finish(`✗ lot ${number} not committed: ${prepared.refusal}`)
				for (const line of prepared.lines ?? []) write(`    ${line}`)
				write(undo())
				return undefined
			}
		} else
			try {
				readGit({ root, args: ['add', '--', ...paths] })
			} catch (error) {
				const unstaged = unstageLot({ root, paths, clock })
				const reason = (error instanceof Error ? error.message : String(error)).split('\n')[0]
				running.finish(`✗ lot ${number} not committed: git add failed: ${reason}`)
				write(
					unstaged.unstaged
						? `    nothing of it stays staged; fix the cause, then run the same command: it resumes at lot ${number}`
						: stillStaged({ unstaged, lot: number }),
				)
				return undefined
			}
		const synced = await syncNodeModules({ root, clock, install: params.install })
		if ('refusal' in synced) {
			running.finish(`✗ lot ${number} not committed: ${synced.refusal}`)
			write(undo())
			return undefined
		}
		if (synced.note) write(`  ${synced.note}`)
		// the hook's log grows as it prints: a run killed midway still leaves it
		const hookLog = createHookLog({ lot: number })
		const commit = await streamCommand({
			command: 'git',
			args: ['commit', '-q', '-F', '-'],
			cwd: root,
			input: `${lot.message.trim()}\n`,
			prefix: HOOK_OUTPUT_PREFIX,
			heartbeatLabel: HOOK_HEARTBEAT_LABEL,
			write,
			clock,
			every: HEARTBEAT_INTERVAL_MILLISECONDS,
			onProcessGroup: params.onProcessGroup,
			step: { running, tty },
			onText: (text) => appendFileSync(hookLog, text),
		})
		const hookLines = commit.output.split(/\r?\n/)
		if (hookLines.at(-1) === '') hookLines.pop()
		const log = hookLines.length ? hookLog : undefined
		if (!log) rmSync(dirname(hookLog), { recursive: true, force: true })
		if (commit.exitCode !== 0) {
			// every hook line stays: on a terminal they were only shown live
			running.finish(
				...(tty ? hookLines.map((line) => `${HOOK_OUTPUT_PREFIX}${line}`) : []),
				...(log ? [`${HOOK_OUTPUT_PREFIX.trimEnd()} full log: ${log}`] : []),
			)
			// the commit's processes are gone by now (a stalled run settles once its tree is killed)
			const undone = undo()
			const elapsed = formatDuration(clock.now() - startedAt)
			if (commit.stalled) {
				write(
					`✗ lot ${number} not committed: git commit ${stallReason({ watchdog: undefined })} (after ${elapsed}); its processes, killed:`,
				)
				for (const line of commit.stalled.report.split('\n')) write(line)
			} else
				write(
					`✗ lot ${number} not committed: git commit exited ${commit.exitCode} after ${elapsed} (its output above)`,
				)
			write(undone)
			return undefined
		}
		const sha = readGit({ root, args: ['rev-parse', 'HEAD'] }).trim()
		commits.push(sha)
		const logLine = log
			? tty
				? `${HOOK_OUTPUT_PREFIX}… ${hookLines.length} line(s) of hook output; full log: ${log}`
				: `${HOOK_OUTPUT_PREFIX.trimEnd()} full log: ${log}`
			: undefined
		running.finish(
			...(logLine ? [logLine] : []),
			`✓ ${sha.slice(0, 12)} ${subject}  ${formatDuration(clock.now() - startedAt)}`,
		)
		// a merge commit's own diff is empty: its stat is against its first parent
		for (const line of readGit({
			root,
			args: lot.merge
				? ['--no-pager', 'diff', '--stat', `${sha}^1`, sha]
				: ['--no-pager', 'show', '--stat', '--format=', sha],
		})
			.split('\n')
			.filter(Boolean))
			write(`  ${line}`)
		if (lot.merge) {
			removeMergeMarker(root)
			const tree = readGit({ root, args: ['rev-parse', `${sha}^{tree}`] }).trim()
			write(`  tree ${tree}`)
			// a hook may stage files of its own: the commit is checked again
			if (lot.merge.tree && tree !== lot.merge.tree) {
				write(
					`✗ lot ${number}: the merge commit ${sha.slice(0, 12)} holds another tree than recorded: ${tree.slice(0, 12)}, recorded ${lot.merge.tree.slice(0, 12)} (a hook staged files of its own?)`,
				)
				write(
					`    the commit stays: look at it (git show --stat ${sha.slice(0, 12)}), and reset it by hand when it is wrong; a rerun refuses it`,
				)
				return undefined
			}
		}
	}
	return commits
}

/** An empty file, in a folder of its own, for the hook's whole output: read once its lines are folded. */
function createHookLog(params: { lot: number }): string {
	const path = join(mkdtempSync(join(tmpdir(), HOOK_LOG_FOLDER_PREFIX)), `lot-${params.lot}.log`)
	writeFileSync(path, '')
	return path
}

/** The lot's files could not be unstaged: what is left and how to clear it. */
function stillStaged(params: { unstaged: { reason: string; lock?: string }; lot: number }): string {
	const { unstaged } = params
	const clear = unstaged.lock
		? `once no git runs in the repository, remove ${unstaged.lock}, then`
		: 'fix the cause, then'
	return `    its files are still staged (git reset failed: ${unstaged.reason}); ${clear} run the same command: its index guard says how to unstage them, and it resumes at lot ${params.lot}`
}
