/**
 * The checks of the free-text options of the lot verbs: one non-empty line (`lot snapshot --by --reason`, `lot verify
 * --by --note`), and no word of the machine's forbidden list (33L1 D3), for every lot verb taking `--by` (`lot
 * snapshot`, `lot verify`, `lot choice`, `lot answer`, `lot stop`; FIX-by-words).
 */
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { findReferences } from '../rules/committed-text.ts'
import { forbiddenWordPatterns, readForbiddenWords } from '../rules/forbidden-words.ts'
import { commonFolderOfLotFolder } from '../store/lot-records.ts'
import { FORBIDDEN_WORD_REFUSAL, LINE_BREAK_PATTERN } from './review-rounds.constants.ts'

import type { ForbiddenWordOption } from './review-rounds.types.ts'

/** Whether the value is given, holds a non-blank character and no line break. */
export function isOneLine(value: string | undefined): value is string {
	return value !== undefined && value.trim() !== '' && !LINE_BREAK_PATTERN.test(value)
}

/**
 * The refusal of a lot verb whose option holds a word of the machine's forbidden list (33L1 D3): the list of the git
 * config of `root` and of the user file; the first such option of `options`, named without its word; undefined when
 * none holds one.
 */
export function forbiddenWordRefusal(params: {
	root: string
	verb: string
	options: readonly ForbiddenWordOption[]
}): string | undefined {
	const patterns = forbiddenWordPatterns(readForbiddenWords({ root: params.root }))
	const holding = params.options.find(
		(candidate) => findReferences({ text: candidate.text, patterns }).length > 0,
	)
	if (!holding) return undefined
	return fillMessage({
		template: FORBIDDEN_WORD_REFUSAL,
		values: { verb: params.verb, option: holding.option },
	})
}

/**
 * The refusal of a store lot's verb (`lot answer`, `lot stop`) whose `--by` holds a forbidden word, the list read
 * from the git config of the lot's own repository (its git common folder), wherever the verb runs from; undefined
 * when `--by` is left out or holds none (FIX-by-words D1).
 */
export function storedLotByRefusal(params: {
	lotFolder: string
	verb: string
	by: string | undefined
}): string | undefined {
	if (params.by === undefined) return undefined
	return forbiddenWordRefusal({
		root: commonFolderOfLotFolder(params.lotFolder),
		verb: params.verb,
		options: [{ option: '--by', text: params.by }],
	})
}
