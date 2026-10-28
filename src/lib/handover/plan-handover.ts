/**
 * The guards a hand-over passes before its script is written: the repository is where the lots file
 * says (branch, HEAD), nothing is staged, every changed file is in exactly one lot, no lot is empty, and
 * no lot file (evals and fixtures included) nor message holds a plan tag or a standard citation.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { listChangedFiles, readGit } from '../git.ts'
import { findReferences, isReferenceChecked } from '../rules/committed-text.ts'
import { BINARY_PROBE_LENGTH } from './handover.constants.ts'

import type { ReferencePattern } from '../rules/committed-text.types.ts'
import type { LotsFile, PlannedHandover, ResolvedLot } from './handover.types.ts'

/** The plan the script is written from, or the reasons it is refused. */
export function planHandover(params: {
	lotsFile: LotsFile
	referencePatterns: readonly ReferencePattern[]
}): PlannedHandover {
	const { lotsFile, referencePatterns } = params
	const root = lotsFile.repository
	const refusals: string[] = []

	const branch = readGit({ root, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()
	if (branch !== lotsFile.branch)
		refusals.push(`expected branch ${lotsFile.branch}, the repository is on ${branch}`)
	const head = readGit({ root, args: ['rev-parse', 'HEAD'] }).trim()
	if (!head.startsWith(lotsFile.head))
		refusals.push(`expected HEAD ${lotsFile.head}, the repository is at ${head.slice(0, 12)}`)
	if (readGit({ root, args: ['diff', '--cached', '--name-only'] }).trim())
		refusals.push('something is staged already: the script stages each lot itself')

	const changedFiles = listChangedFiles({ root, withDeleted: true })
	const lotIndexByFile = new Map<string, number>()
	const lots: ResolvedLot[] = lotsFile.lots.map(function resolveLot(lot, index): ResolvedLot {
		const files = changedFiles.filter((file) => lot.paths.some((path) => covers({ path, file })))
		for (const file of files) {
			const earlier = lotIndexByFile.get(file)
			if (earlier === undefined) lotIndexByFile.set(file, index)
			else refusals.push(`${file} is in lot ${earlier + 1} and in lot ${index + 1}`)
		}
		if (files.length === 0) refusals.push(`lot ${index + 1} has no changed file`)
		return {
			message: lot.message,
			files: files.filter((file) => existsSync(join(root, file))),
			deletedFiles: files.filter((file) => !existsSync(join(root, file))),
		}
	})
	for (const file of changedFiles)
		if (!lotIndexByFile.has(file)) refusals.push(`changed file in no lot: ${file}`)

	for (const [index, lot] of lots.entries()) {
		if (!lot.message.trim()) refusals.push(`lot ${index + 1} has no message`)
		for (const reference of findReferences({ text: lot.message, patterns: referencePatterns }))
			refusals.push(
				`lot ${index + 1} message, line ${reference.line}: ${reference.label} \`${reference.text}\``,
			)
		for (const file of lot.files) {
			const content = readFileSync(join(root, file))
			if (isBinary(content) || !isReferenceChecked(file)) continue
			for (const reference of findReferences({
				text: content.toString('utf8'),
				patterns: referencePatterns,
			}))
				refusals.push(`${file}:${reference.line}: ${reference.label} \`${reference.text}\``)
		}
	}

	return {
		plan: { repository: root, branch: lotsFile.branch, head, gates: lotsFile.gates, lots },
		refusals,
	}
}

/** A path names a file, or a folder (with or without its trailing `/`) holding it. */
function covers(params: { path: string; file: string }): boolean {
	const folder = params.path.endsWith('/') ? params.path : `${params.path}/`
	return params.file === params.path || params.file.startsWith(folder)
}

/** As `grep -I` decides: a NUL byte near the start makes a file binary. */
function isBinary(content: Buffer): boolean {
	return content.subarray(0, BINARY_PROBE_LENGTH).includes(0)
}
