/**
 * The backstop for public text: the record-sourced free text a pull request body shows (`publicPiecesOf`) checked
 * before anything is sent (`publicRefusalOf`): no reference of the lists (a ticket, a citation, a declared pattern, a
 * consumer name, a forbidden word), no entry id of the plans that hold the lot, no link and no path the lot's tree does
 * not hold. Pure: the lists and the tree test are read by the caller.
 */
import {
	CURRENT_FOLDER_PREFIX,
	LINE_SUFFIX_PATTERN,
} from '../review-rounds/review-record.constants.ts'
import { findReferences } from '../rules/committed-text.ts'
import { PATH_OR_LINK_PATTERN, PLAN_ENTRY_ID_LABEL } from '../store/public-text.constants.ts'
import { planEntryIdIn } from '../store/public-text.ts'
import {
	LINK_PATTERN,
	PIECE_RECORDS,
	PRIVATE_PATH_LABEL,
	TOKEN_SEPARATOR_PATTERN,
	TOKEN_TRIM_PATTERN,
} from './pull-request.constants.ts'

import type { ReferencePattern } from '../rules/committed-text.types.ts'
import type { PublicPiece, PublicRefusal, PullRequestSources } from './pull-request.types.ts'

/** The free text of the records the body shows, each with its record; the cli's own rows are none. */
export function publicPiecesOf(sources: PullRequestSources): PublicPiece[] {
	const messages = sources.messages.map((text, index) => ({
		record: PIECE_RECORDS.message.replace('{index}', String(index)),
		text,
	}))
	const summary =
		sources.summary === undefined ? [] : [{ record: PIECE_RECORDS.summary, text: sources.summary }]
	const steps = (sources.steps ?? []).flatMap(function stepPieces(step, index) {
		return [
			{ record: PIECE_RECORDS.stepTitle.replace('{index}', String(index)), text: step.title },
			...step.behaviours.map((text, behaviour) => ({
				record: PIECE_RECORDS.behaviour
					.replace('{index}', String(index))
					.replace('{behaviour}', String(behaviour)),
				text,
			})),
		]
	})
	const { changelog } = sources
	const changes =
		changelog === undefined
			? []
			: changelog.kind === 'none'
				? [{ record: changelog.file, text: changelog.reason }]
				: changelog.entries.map((entry) => ({ record: entry.file, text: entry.text }))
	const overlaps = (sources.overlaps ?? []).map((overlap) => ({
		record: PIECE_RECORDS.overlap,
		text: overlap.reason,
	}))
	return [...messages, ...summary, ...steps, ...changes, ...overlaps]
}

/** The first piece holding what a public body never holds, by record; undefined when every piece passes. */
export function publicRefusalOf(params: {
	pieces: PublicPiece[]
	patterns: readonly ReferencePattern[]
	ids: ReadonlySet<string>
	/** The files of the lot's tree: its committed head's and its base's. */
	treeFiles: ReadonlySet<string>
}): PublicRefusal | undefined {
	for (const piece of params.pieces) {
		const path = privatePathIn({ text: piece.text, treeFiles: params.treeFiles })
		if (path !== undefined) return { record: piece.record, label: PRIVATE_PATH_LABEL, word: path }
		const reference = findReferences({ text: piece.text, patterns: params.patterns })[0]
		if (reference !== undefined)
			return { record: piece.record, label: reference.label, word: reference.text }
		const id = planEntryIdIn({ text: piece.text, ids: params.ids })
		if (id !== undefined) return { record: piece.record, label: PLAN_ENTRY_ID_LABEL, word: id }
	}
	return undefined
}

/**
 * The first token of the text that is a link, or a path (its `./` and line dropped) the lot's tree does not hold: a
 * file it does not list, or a folder (`a/b/`) none of its files sits in.
 */
function privatePathIn(params: {
	text: string
	treeFiles: ReadonlySet<string>
}): string | undefined {
	const files = [...params.treeFiles]
	return params.text
		.split(TOKEN_SEPARATOR_PATTERN)
		.map((token) => token.replace(TOKEN_TRIM_PATTERN, ''))
		.find(function isPrivate(token) {
			if (!PATH_OR_LINK_PATTERN.test(token)) return false
			if (LINK_PATTERN.test(token)) return true
			const path = token.replace(CURRENT_FOLDER_PREFIX, '').replace(LINE_SUFFIX_PATTERN, '')
			if (!path.endsWith('/')) return !params.treeFiles.has(path)
			return !files.some((file) => file.startsWith(path))
		})
}
