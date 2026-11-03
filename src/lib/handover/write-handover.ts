/**
 * Writes a hand-over folder: `lots.json` (the agent's, copied when the folder is elsewhere), the snapshot
 * (`files.txt`: every path the lots commit; `files.sha256`: the hash of each one that exists;
 * `files.deleted`; `merges.json`: each merge lot's conflicts and resolutions with their hashes) and the
 * one-line `commit.sh`; then takes the repository's hand-over lock. Nothing is
 * written per lot: `handover run` reads the lots from `lots.json`.
 */
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { renderCommitScript } from './commit-script.ts'
import { readCommittedBytes } from './committed-bytes.ts'
import { handoverLockPath } from './handover-lock.ts'
import { COMMIT_SCRIPT_FILE, HANDOVER_FILES } from './handover.constants.ts'

import type { HandoverPlan, LotsFile } from './handover.types.ts'

export function writeHandover(params: {
	plan: HandoverPlan
	lotsFile: LotsFile
	/** Where the agent's lots file is. */
	lotsPath: string
	out: string
	cliPath: string
}): void {
	const { plan, out } = params
	mkdirSync(out, { recursive: true })
	const lotsCopy = join(out, HANDOVER_FILES.lots)
	if (resolve(params.lotsPath) !== resolve(lotsCopy) || !existsSync(lotsCopy))
		writeFileSync(lotsCopy, `${JSON.stringify(params.lotsFile, null, '\t')}\n`)

	writeFileSync(join(out, HANDOVER_FILES.lotsHash), `${hashFile(lotsCopy)}\n`)

	const existing = plan.lots.flatMap((lot) => lot.files).sort()
	writeFileSync(
		join(out, HANDOVER_FILES.files),
		linesOf(plan.lots.flatMap((lot) => [...lot.files, ...lot.deletedFiles]).sort()),
	)
	writeFileSync(
		join(out, HANDOVER_FILES.hashes),
		linesOf(existing.map((file) => `${hashFile(join(plan.repository, file))}  ${file}`)),
	)
	writeFileSync(
		join(out, HANDOVER_FILES.deleted),
		linesOf(plan.lots.flatMap((lot) => lot.deletedFiles).sort()),
	)
	const merges = Object.fromEntries(
		plan.lots.flatMap((lot, index) => (lot.merge ? [[String(index), lot.merge]] : [])),
	)
	if (Object.keys(merges).length) {
		const mergesPath = join(out, HANDOVER_FILES.merges)
		writeFileSync(mergesPath, `${JSON.stringify(merges, null, '\t')}\n`)
		// under the review hash like lots.json: an edit after the review is refused
		writeFileSync(join(out, HANDOVER_FILES.mergesHash), `${hashFile(mergesPath)}\n`)
	}

	const scriptPath = join(out, COMMIT_SCRIPT_FILE)
	writeFileSync(scriptPath, renderCommitScript({ plan, folder: out, cliPath: params.cliPath }))
	chmodSync(scriptPath, 0o755)
	writeFileSync(handoverLockPath(plan.repository), `${scriptPath}\n`)
}

/** sha256 of the bytes git commits for a path (a link: its target text), as `shasum -a 256` prints it for a file. */
export function hashFile(path: string): string {
	return createHash('sha256').update(readCommittedBytes(path)).digest('hex')
}

function linesOf(lines: readonly string[]): string {
	return lines.length ? `${lines.join('\n')}\n` : ''
}
