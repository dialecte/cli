/**
 * Writes a hand-over folder: `lotN.txt` (paths) and `lotN.msg` (message) per lot, `files.txt` (every
 * path the lots commit), `files.sha256` (the snapshot of the files that exist), `files.deleted`, and
 * `commit.sh`; then takes the repository's hand-over lock.
 */
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readGit } from '../git.ts'
import { renderCommitScript } from './commit-script.ts'
import { handoverLockPath } from './handover-lock.ts'
import { COMMIT_SCRIPT_FILE } from './handover.constants.ts'

import type { ReferencePattern } from '../rules/committed-text.types.ts'
import type { DiffSize, HandoverPlan, LotSummary } from './handover.types.ts'

export function writeHandover(params: {
	plan: HandoverPlan
	referencePatterns: readonly ReferencePattern[]
	out: string
}): LotSummary[] {
	const { plan, out } = params
	mkdirSync(out, { recursive: true })
	const hashLineByFile = new Map<string, string>()
	for (const lot of plan.lots)
		for (const file of lot.files)
			hashLineByFile.set(
				file,
				`${createHash('sha256')
					.update(readFileSync(join(plan.repository, file)))
					.digest('hex')}  ${file}`,
			)

	const summaries = plan.lots.map(function writeLot(lot, index): LotSummary {
		const paths = [...lot.files, ...lot.deletedFiles].sort()
		writeFileSync(join(out, `lot${index + 1}.txt`), linesOf(paths))
		writeFileSync(join(out, `lot${index + 1}.msg`), `${lot.message.trim()}\n`)
		const snapshotLines = lot.files.map((file) => hashLineByFile.get(file) ?? '')
		return {
			index: index + 1,
			subject: lot.message.trim().split('\n')[0],
			fileCount: paths.length,
			...diffSizeOf({ root: plan.repository, files: lot.files, deletedFiles: lot.deletedFiles }),
			snapshot: createHash('sha256').update(linesOf(snapshotLines)).digest('hex'),
		}
	})

	const allFiles = plan.lots.flatMap((lot) => lot.files).sort()
	writeFileSync(
		join(out, 'files.txt'),
		linesOf(plan.lots.flatMap((lot) => [...lot.files, ...lot.deletedFiles]).sort()),
	)
	writeFileSync(
		join(out, 'files.sha256'),
		linesOf(allFiles.map((file) => hashLineByFile.get(file) ?? '')),
	)
	writeFileSync(
		join(out, 'files.deleted'),
		linesOf(plan.lots.flatMap((lot) => lot.deletedFiles).sort()),
	)

	const scriptPath = join(out, COMMIT_SCRIPT_FILE)
	const lockPath = handoverLockPath(plan.repository)
	writeFileSync(
		scriptPath,
		renderCommitScript({ plan, referencePatterns: params.referencePatterns, scriptPath, lockPath }),
	)
	chmodSync(scriptPath, 0o755)
	writeFileSync(lockPath, `${scriptPath}\n`)
	return summaries
}

/** Lines added and removed by the lot against HEAD, a new file counted as all added. */
function diffSizeOf(params: { root: string; files: string[]; deletedFiles: string[] }): DiffSize {
	const tracked = new Set(
		readGit({
			root: params.root,
			args: ['ls-files', '--', ...params.files, ...params.deletedFiles],
		})
			.split('\n')
			.filter(Boolean),
	)
	let insertions = 0
	let deletions = 0
	const trackedPaths = [...params.files, ...params.deletedFiles].filter((file) => tracked.has(file))
	if (trackedPaths.length)
		for (const line of readGit({
			root: params.root,
			args: ['diff', '--numstat', '--no-renames', 'HEAD', '--', ...trackedPaths],
		})
			.split('\n')
			.filter(Boolean)) {
			const [added, removed] = line.split('\t')
			insertions += Number(added) || 0
			deletions += Number(removed) || 0
		}
	for (const file of params.files.filter((path) => !tracked.has(path)))
		insertions += lineCountOf(readFileSync(join(params.root, file), 'utf8'))
	return { insertions, deletions }
}

/** Lines as git counts them: a last line without its newline counts too. */
function lineCountOf(text: string): number {
	if (!text) return 0
	return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

function linesOf(lines: readonly string[]): string {
	return lines.length ? `${lines.join('\n')}\n` : ''
}
