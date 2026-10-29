/**
 * The guards `handover run` checks before its first commit, each announced on one line with its result
 * and how long it took: the hooks folder, the branch, HEAD (or the lots already committed on top of it),
 * an empty index, the files against the reviewed snapshot, the deleted files, files outside the lots,
 * and plan tags or standard citations in the lots' files and messages.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describeMissingHooksFolder, readHooksFolder } from '../git-hooks.ts'
import { listChangedFiles, listStagedFiles, readGit } from '../git.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { readReferencePatterns } from '../rules/committed-text.ts'
import { shellQuote } from '../shell-quote.ts'
import { findCommittedLots } from './find-committed-lots.ts'
import { findLotReferences } from './find-lot-references.ts'
import { GUARD_NAME_WIDTH, HANDOVER_FILES } from './handover.constants.ts'
import { hashFile } from './write-handover.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { GuardedRun, GuardVerdict, HandoverFolder, WriteLine } from './handover.types.ts'

/** The run's HEAD and the lots committed already; undefined when a guard refused (its lines written). */
export function checkHandoverGuards(params: {
	handover: HandoverFolder
	write: WriteLine
	clock: Clock
}): GuardedRun | undefined {
	const { handover, write, clock } = params
	const { lotsFile, lots } = handover
	const root = lotsFile.repository
	const run: GuardedRun = { head: '', commits: [] }

	const guards: { name: string; check: () => GuardVerdict }[] = [
		{
			name: 'repository',
			check: function repositoryExists() {
				return existsSync(root)
					? { ok: true, detail: root }
					: { ok: false, detail: `${root} does not exist` }
			},
		},
		{
			name: 'lots',
			check: function lotsAsReviewed() {
				return hashFile(join(handover.folder, HANDOVER_FILES.lots)) === handover.lotsHash
					? { ok: true, detail: `${lots.length} lot(s) as reviewed` }
					: {
							ok: false,
							detail:
								'lots.json changed since the hand-over was written: `dialecte handover --rehash <lots.json>` after a review',
						}
			},
		},
		{
			name: 'hooks',
			check: function hooksFolderExists() {
				const missing = describeMissingHooksFolder(root)
				if (missing) return { ok: false, detail: missing }
				const { configured } = readHooksFolder(root)
				return { ok: true, detail: configured ?? 'git hooks folder' }
			},
		},
		{
			name: 'branch',
			check: function onTheBranch() {
				const branch = readGit({ root, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()
				return branch === lotsFile.branch
					? { ok: true, detail: branch }
					: { ok: false, detail: `expected ${lotsFile.branch}, the repository is on ${branch}` }
			},
		},
		{
			name: 'head',
			check: function onTheRecordedHead() {
				const resolved = resolveCommit({ root, revision: lotsFile.head })
				if (!resolved) return { ok: false, detail: `${lotsFile.head} is not a commit of ${root}` }
				run.head = resolved
				const found = findCommittedLots({
					root,
					head: resolved,
					tip: 'HEAD',
					lots,
					compareContent: true,
				})
				run.commits = found.commits
				if (found.foreign)
					return {
						ok: false,
						detail: `something else is on top of ${resolved.slice(0, 12)}`,
						lines: [
							found.foreign,
							`look: git -C ${shellQuote(root)} log --oneline ${resolved.slice(0, 12)}..HEAD`,
						],
					}
				const count = found.commits.length
				if (count === 0) return { ok: true, detail: resolved.slice(0, 12) }
				return {
					ok: true,
					detail:
						count === lots.length
							? `${resolved.slice(0, 12)}, every lot is committed already`
							: `${resolved.slice(0, 12)}, ${count} of ${lots.length} lot(s) committed already: resuming at lot ${count + 1}`,
				}
			},
		},
		{
			name: 'index',
			check: function nothingStaged() {
				const staged = listStagedFiles(root)
				if (staged.length === 0) return { ok: true, detail: 'empty' }
				const next = lots[run.commits.length]
				const nextPaths = next ? [...next.files, ...next.deletedFiles].sort() : []
				const stoppedRun = staged.join('\n') === nextPaths.join('\n')
				return {
					ok: false,
					detail: `${staged.length} file(s) staged already: the run stages each lot itself`,
					lines: [
						...staged,
						...(stoppedRun
							? [
									`the next lot's files, staged by a run that stopped: unstage them with  cd ${shellQuote(root)} && git reset -q -- ${staged.map(shellQuote).join(' ')}`,
								]
							: []),
					],
				}
			},
		},
		{
			name: 'snapshot',
			check: function filesAsReviewed() {
				const differing = handover.snapshotLines.filter(function differs(line) {
					const [hash, ...pathParts] = line.split('  ')
					const path = join(root, pathParts.join('  '))
					return !existsSync(path) || hashFile(path) !== hash
				})
				return differing.length
					? {
							ok: false,
							detail: `${differing.length} file(s) differ from the reviewed snapshot: \`dialecte handover --rehash <lots.json>\` after a review`,
							lines: differing.map((line) => line.split('  ').slice(1).join('  ')),
						}
					: { ok: true, detail: `${handover.snapshotLines.length} file(s)` }
			},
		},
		{
			name: 'deleted',
			check: function deletedStayDeleted() {
				const deleted = lots.flatMap((lot) => lot.deletedFiles)
				const back = deleted.filter((file) => existsSync(join(root, file)))
				return back.length
					? { ok: false, detail: 'deleted in the snapshot and there again', lines: back }
					: { ok: true, detail: `${deleted.length} file(s) absent` }
			},
		},
		{
			name: 'outside',
			check: function nothingElseChanged() {
				const inLots = new Set(lots.flatMap((lot) => [...lot.files, ...lot.deletedFiles]))
				const extra = listChangedFiles({ root, withDeleted: true }).filter(
					(file) => !inLots.has(file),
				)
				return extra.length
					? { ok: false, detail: `${extra.length} file(s) changed outside the lots`, lines: extra }
					: { ok: true, detail: 'no other file changed' }
			},
		},
		{
			name: 'references',
			check: function noTagNorCitation() {
				const found = findLotReferences({
					root,
					lots,
					referencePatterns: readReferencePatterns(root),
				})
				const fileCount = lots.reduce((total, lot) => total + lot.files.length, 0)
				return found.length
					? { ok: false, detail: 'a plan tag or a standard citation', lines: found }
					: { ok: true, detail: `${fileCount} file(s), ${lots.length} message(s)` }
			},
		},
	]
	for (const { name, check } of guards) {
		const startedAt = clock.now()
		const verdict = check()
		write(
			`${verdict.ok ? '✓' : '✗'} ${name.padEnd(GUARD_NAME_WIDTH)} ${verdict.detail}  ${formatDuration(clock.now() - startedAt)}`,
		)
		for (const line of verdict.lines ?? []) write(`    ${line}`)
		if (!verdict.ok) return undefined
	}
	return run
}

/** The full sha of a revision, or undefined when the repository has no such commit. */
function resolveCommit(params: { root: string; revision: string }): string | undefined {
	const result = spawnSync(
		'git',
		['rev-parse', '--verify', '--quiet', `${params.revision}^{commit}`],
		{ cwd: params.root, encoding: 'utf8' },
	)
	return result.status === 0 ? result.stdout.trim() : undefined
}
