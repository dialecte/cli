import { HIDDEN_NAME_START, STANDARD_FILE_EXTENSION } from './standard-input.constants.ts'
import { namesAnswerOf } from './standard-names-answer-of.ts'

import type { StandardFilesOfParams, StandardNamesAnswer } from './standard-input.types.ts'

/**
 * The files of a standard folder's entries: the non-hidden files ending in `.md`, their id
 * `<standard id>/<lowercased name without .md>`; two names whose ids collide are answered as a collision.
 */
export function standardFilesOf(params: StandardFilesOfParams): StandardNamesAnswer {
	return namesAnswerOf({
		named: params.entries
			.filter(
				(entry) =>
					entry.kind === 'file' &&
					!entry.name.startsWith(HIDDEN_NAME_START) &&
					entry.name.endsWith(STANDARD_FILE_EXTENSION),
			)
			.map((entry) => ({
				id: `${params.standardId}/${entry.name.slice(0, -STANDARD_FILE_EXTENSION.length).toLowerCase()}`,
				name: entry.name,
			})),
	})
}
