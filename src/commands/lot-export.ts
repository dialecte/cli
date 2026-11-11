/**
 * `dialecte lot export <id> <dir> [--json]` (33L0 section 9.6): copies a lot folder, `asks/` left out, into
 * `<dir>/<full name>/`, with the lot's `cards.log` lines and its registry entry, checks the copy against the source,
 * and renames it into place.
 */
import { realpathSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { isFolder } from '../lib/file-system.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { existsAsAnything, exportLot, exportTemporaryOf } from '../lib/store/export-lot.ts'
import { gitPlaceHolding } from '../lib/store/git-place.ts'
import { lotFailureExit, lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import { requireLot } from '../lib/store/resolve-lot.ts'
import { LINE_FEED } from '../lib/store/store.constants.ts'
import { printableOf } from '../lib/store/text-escape.ts'
import { EXPORT_FLAGS } from './lot-export.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { LotExportJson, LotExportParams } from './lot-export.types.ts'

/** Exit 0 copied and checked; 1 the check failed twice (nothing left at `<dir>/<name>`); 2 usage or refused. */
export function lotExport(params: LotExportParams): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: EXPORT_FLAGS })
	if (typeof read === 'string')
		return lotUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) })
	const json = read.flags.has('json')
	const [id, dir, ...extra] = read.words
	if (id === undefined || dir === undefined)
		return lotUsageExit({ reason: 'lot export takes an id and a folder', json })
	if (extra.length > 0)
		return lotUsageExit({
			reason: `lot export takes an id and a folder, not also ${extra.join(' ')}`,
			json,
		})
	const required = requireLot({ argument: id, cwd: params.cwd, mode: 'write' })
	if ('exitCode' in required) return lotRefusalExit({ message: required.output, json })
	const target = checkedDirOf({ cwd: params.cwd, dir, name: basename(required.lot) })
	if ('refused' in target) return lotRefusalExit({ message: target.refused, json })
	const outcome = exportLot({
		lotFolder: required.lot,
		dir: target.dir,
		afterFileCopied: params.afterFileCopied,
	})
	if ('failed' in outcome)
		return lotFailureExit({ message: `lot export: ${printableOf(outcome.failed)}`, json })
	return {
		exitCode: 0,
		output: json
			? JSON.stringify(
					{
						...outcome.exported,
						...(outcome.leftovers.length > 0 && { leftovers: outcome.leftovers }),
					},
					null,
					2,
				)
			: exportLines({ answer: outcome.exported, leftovers: outcome.leftovers }).join(LINE_FEED),
	}
}

/**
 * `<dir>` as a real path when the copy may go there: an existing folder in no git work tree nor git folder, holding
 * neither `<full name>` nor this run's temporary folder; else why not (nothing written).
 */
function checkedDirOf(params: {
	cwd: string
	dir: string
	name: string
}): { dir: string } | { refused: string } {
	const given = resolve(params.cwd, params.dir)
	const shown = printableOf(params.dir)
	if (!isFolder(given)) return { refused: `lot export: ${shown} is no existing folder` }
	const dir = realpathSync(given)
	const place = gitPlaceHolding({ folder: dir })
	if (place !== undefined)
		return {
			refused: `lot export: ${shown} lies in the git work tree or git folder ${printableOf(place)}: export outside every repository`,
		}
	for (const taken of [join(dir, params.name), exportTemporaryOf({ dir, name: params.name })])
		if (existsAsAnything(taken))
			return { refused: `lot export: ${printableOf(taken)} exists: never merged into` }
	return { dir }
}

/** The text answer: the copy and its counts, what was skipped, the links leaving the lot, other runs' leftovers. */
function exportLines(params: { answer: LotExportJson; leftovers: readonly string[] }): string[] {
	const { answer } = params
	return [
		`exported ${printableOf(answer.exported)}: ${answer.files} files and links, ${answer.bytes} bytes`,
		...answer.skipped.map((skipped) => `skipped  ${printableOf(skipped)}`),
		...answer.links.map(
			(link) =>
				`link out ${printableOf(link.path)} -> ${printableOf(link.target)} (copied as a link)`,
		),
		...params.leftovers.map(
			(leftover) => `leftover ${printableOf(leftover)} (another run's temporary copy, not removed)`,
		),
	]
}
