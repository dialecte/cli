/**
 * The check of a text a public record holds (a brief's summary, a verify's `--by`): no path or link, no reference a
 * committed text never holds - every generic pattern (none allowed, a tag included), those the repository's package
 * declares, a contributor's consumer names, the machine's forbidden words - and no entry id of the lot plan it names.
 */
import { readPlanBlock } from '../plan/plan-block.ts'
import { GENERIC_REFERENCE_PATTERNS } from '../rules/committed-text.constants.ts'
import { findReferences, readListedPatterns } from '../rules/committed-text.ts'
import { forbiddenWordPatterns, readForbiddenWords } from '../rules/forbidden-words.ts'
import { PATH_OR_LINK_LABEL, PATH_OR_LINK_PATTERN, WORD_PATTERN } from './public-text.constants.ts'

/** Whether the text holds a path or a link. */
export function holdsPathOrLink(text: string): boolean {
	return PATH_OR_LINK_PATTERN.test(text)
}

/** Whether the text holds a path, a link or a generic reference (a tag, a ticket, a citation): no machine list read. */
export function holdsPathOrGenericReference(text: string): boolean {
	return (
		holdsPathOrLink(text) ||
		findReferences({ text, patterns: GENERIC_REFERENCE_PATTERNS }).length > 0
	)
}

/**
 * The label of the first reference of `root`'s lists the text holds; undefined when it holds none. Throws when the
 * package's lists or the machine's forbidden words cannot be read.
 */
export function referenceLabelIn(params: { text: string; root: string }): string | undefined {
	const patterns = [
		...GENERIC_REFERENCE_PATTERNS,
		...readListedPatterns(params.root),
		...forbiddenWordPatterns(readForbiddenWords({ root: params.root })),
	]
	return findReferences({ text: params.text, patterns })[0]?.label
}

/** The label of what the text holds that a public record never holds: a path or a link first, then a reference. */
export function publicTextLabel(params: { text: string; root: string }): string | undefined {
	return holdsPathOrLink(params.text) ? PATH_OR_LINK_LABEL : referenceLabelIn(params)
}

/**
 * Whether the text holds, as a whole word, the id of an entry of the lot block of the plan at `planPath`; false for a
 * plan whose block cannot be read (a plan with no block names no entry).
 */
export function holdsPlanEntryId(params: { text: string; planPath: string }): boolean {
	const read = readPlanBlock({ planPath: params.planPath })
	if ('faults' in read) return false
	const ids = new Set(
		read.block.lots.map(function idOf(entry) {
			return entry.id
		}),
	)
	return (params.text.match(WORD_PATTERN) ?? []).some(function isEntryId(word) {
		return ids.has(word)
	})
}
