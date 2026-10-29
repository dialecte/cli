/**
 * The guards a hand-over passes before its folder is written: the repository is where the lots file
 * says (branch, HEAD), its hooks folder exists, nothing is staged, every changed file is in exactly one
 * lot, no lot is empty, and no lot file (evals and fixtures included) nor message holds a plan tag or a
 * standard citation.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describeMissingHooksFolder } from '../git-hooks.ts'
import { listChangedFiles, listStagedFiles, readGit } from '../git.ts'
import { findLotReferences } from './find-lot-references.ts'
import { lotPathCovers } from './read-lots-file.ts'

import type { ReferencePattern } from '../rules/committed-text.types.ts'
import type { LotsFile, PlannedHandover, ResolvedLot } from './handover.types.ts'

/** The plan the folder is written from, or the reasons it is refused. */
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
	const missingHooks = describeMissingHooksFolder(root)
	if (missingHooks) refusals.push(missingHooks)
	if (listStagedFiles(root).length)
		refusals.push('something is staged already: the script stages each lot itself')

	const changedFiles = listChangedFiles({ root, withDeleted: true })
	const lotIndexByFile = new Map<string, number>()
	const lots: ResolvedLot[] = lotsFile.lots.map(function resolveLot(lot, index): ResolvedLot {
		const files = changedFiles.filter((file) =>
			lot.paths.some((path) => lotPathCovers({ path, file })),
		)
		for (const file of files) {
			const earlier = lotIndexByFile.get(file)
			if (earlier === undefined) lotIndexByFile.set(file, index)
			else refusals.push(`${file} is in lot ${earlier + 1} and in lot ${index + 1}`)
		}
		if (files.length === 0) refusals.push(`lot ${index + 1} has no changed file`)
		if (!lot.message.trim()) refusals.push(`lot ${index + 1} has no message`)
		return {
			message: lot.message,
			files: files.filter((file) => existsSync(join(root, file))),
			deletedFiles: files.filter((file) => !existsSync(join(root, file))),
		}
	})
	for (const file of changedFiles)
		if (!lotIndexByFile.has(file)) refusals.push(`changed file in no lot: ${file}`)
	refusals.push(...findLotReferences({ root, lots, referencePatterns }))

	return {
		plan: { repository: root, branch: lotsFile.branch, head, gates: lotsFile.gates, lots },
		refusals,
	}
}
