import { GENERIC_REFERENCE_PATTERNS } from '../rules/committed-text.constants.ts'
/**
 * The check of a text a public record holds (a brief's summary, a verify's `--by`): no path or link, no reference a
 * committed text never holds - every generic pattern (none allowed, a tag included), those the repository's package
 * declares, a contributor's consumer names, the machine's forbidden words.
 */
import { findReferences, readListedPatterns } from '../rules/committed-text.ts'
import { forbiddenWordPatterns, readForbiddenWords } from '../rules/forbidden-words.ts'
import { PATH_OR_LINK_LABEL, PATH_OR_LINK_PATTERN } from './public-text.constants.ts'

/** Whether the text holds a path or a link. */
export function holdsPathOrLink(text: string): boolean {
	return PATH_OR_LINK_PATTERN.test(text)
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
