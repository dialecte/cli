import { HIDDEN_NAME_START } from './standard-input.constants.ts'
import { namesAnswerOf } from './standard-names-answer-of.ts'

import type { StandardFoldersOfParams, StandardNamesAnswer } from './standard-input.types.ts'

/**
 * The standard folders of a root's entries: the non-hidden folders, their id the lowercased name; two names
 * whose ids collide are answered as a collision.
 */
export function standardFoldersOf(params: StandardFoldersOfParams): StandardNamesAnswer {
	return namesAnswerOf({
		named: params.entries
			.filter((entry) => entry.kind === 'folder' && !entry.name.startsWith(HIDDEN_NAME_START))
			.map((entry) => ({ id: entry.name.toLowerCase(), name: entry.name })),
	})
}
