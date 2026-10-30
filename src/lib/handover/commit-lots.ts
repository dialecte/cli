/**
 * Commits the lots not committed yet, one after the other: `lot n/N` with its files and subject, the
 * commit's hook output streamed behind a prefix with a heartbeat while it is silent, then the commit's
 * sha and stat. A lot whose commit fails is unstaged again, so the same command resumes at it once the
 * cause is fixed. A commit whose hook prints nothing and gains no CPU for the stall time is stopped: its
 * process tree is printed, then killed, and the lot is not committed.
 */
import { readGit } from '../git.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { HEARTBEAT_INTERVAL_MILLISECONDS } from '../progress/progress.constants.ts'
import { stallReason } from '../progress/stall-reason.ts'
import { streamCommand } from '../progress/stream-command.ts'
import { HOOK_HEARTBEAT_LABEL, HOOK_OUTPUT_PREFIX } from './handover.constants.ts'
import { unstageLot } from './unstage-lot.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { ResolvedLot, WriteLine } from './handover.types.ts'

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
}): Promise<string[] | undefined> {
	const { root, lots, write, clock } = params
	const commits = [...params.commits]
	for (const [index, lot] of lots.entries()) {
		if (index < commits.length) continue
		const paths = [...lot.files, ...lot.deletedFiles].sort()
		const subject = lot.message.trim().split('\n')[0]
		write(`lot ${index + 1}/${lots.length}  ${paths.length} file(s)  ${subject}`)
		const startedAt = clock.now()
		try {
			readGit({ root, args: ['add', '--', ...paths] })
		} catch (error) {
			const unstaged = unstageLot({ root, paths, clock })
			const reason = (error instanceof Error ? error.message : String(error)).split('\n')[0]
			write(`✗ lot ${index + 1} not committed: git add failed: ${reason}`)
			write(
				unstaged.unstaged
					? `    nothing of it stays staged; fix the cause, then run the same command: it resumes at lot ${index + 1}`
					: stillStaged({ unstaged, lot: index + 1 }),
			)
			return undefined
		}
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
		})
		if (commit.exitCode !== 0) {
			// the commit's processes are gone by now (a stalled run settles once its tree is killed)
			const unstaged = unstageLot({ root, paths, clock })
			const elapsed = formatDuration(clock.now() - startedAt)
			if (commit.stalled) {
				write(
					`✗ lot ${index + 1} not committed: git commit ${stallReason({ watchdog: undefined })} (after ${elapsed}); its processes, killed:`,
				)
				for (const line of commit.stalled.report.split('\n')) write(line)
			} else
				write(
					`✗ lot ${index + 1} not committed: git commit exited ${commit.exitCode} after ${elapsed} (its output above)`,
				)
			write(
				unstaged.unstaged
					? `    its files are unstaged again, nothing else changed; fix the cause, then run the same command: it resumes at lot ${index + 1}`
					: stillStaged({ unstaged, lot: index + 1 }),
			)
			return undefined
		}
		const sha = readGit({ root, args: ['rev-parse', 'HEAD'] }).trim()
		commits.push(sha)
		write(`✓ ${sha.slice(0, 12)} ${subject}  ${formatDuration(clock.now() - startedAt)}`)
		for (const line of readGit({ root, args: ['--no-pager', 'show', '--stat', '--format=', sha] })
			.split('\n')
			.filter(Boolean))
			write(`  ${line}`)
	}
	return commits
}

/** The lot's files could not be unstaged: what is left and how to clear it. */
function stillStaged(params: { unstaged: { reason: string; lock?: string }; lot: number }): string {
	const { unstaged } = params
	const clear = unstaged.lock
		? `once no git runs in the repository, remove ${unstaged.lock}, then`
		: 'fix the cause, then'
	return `    its files are still staged (git reset failed: ${unstaged.reason}); ${clear} run the same command: its index guard says how to unstage them, and it resumes at lot ${params.lot}`
}
