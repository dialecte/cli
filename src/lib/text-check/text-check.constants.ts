/** The kinds, headings, caps and wordings of `dialecte text check`. */
import type { TextKind } from './text-check.types.ts'

export const TEXT_USAGE = 'text: check <file> [--kind pr|issue|comment|commit]'

export const TEXT_CHECK_USAGE = 'text check: expected <file> [--kind pr|issue|comment|commit]'

/** The options `text check` takes followed by a value, without the dashes. */
export const TEXT_CHECK_OPTIONS = ['kind'] as const

export const DEFAULT_TEXT_KIND: TextKind = 'pr'

/**
 * The word cap of each kind: a pull request points at its diff; an issue stands alone, so it carries the
 * context a pull request leaves to the code; a comment answers one point; a commit body says the why.
 */
export const WORD_CAPS: Readonly<Record<TextKind, number>> = {
	pr: 150,
	issue: 200,
	comment: 80,
	commit: 100,
}

/** The headings a pull request or an issue holds, in their order. */
export const REQUIRED_HEADINGS: readonly string[] = ['What changes', 'Why', 'How to check it']

/** The heading that comes last, only when it has something to say. */
export const OPTIONAL_HEADING = 'Watch out'

/** The kinds that hold the fixed headings; the others hold none. */
export const HEADED_KINDS: readonly TextKind[] = ['pr', 'issue']

/** The longest commit subject: git cuts longer ones in logs, GitHub in its list. */
export const SUBJECT_MAX_LENGTH = 72

/** A line where the recap starts (trimmed): the human part is every line before it. */
export const RECAP_START = '<details'

/** An ATX heading: up to three spaces, one to six `#`, then a space and the text, or nothing. */
export const HEADING_PATTERN = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/

/** The closing `#`s of an ATX heading, with the spaces before them. */
export const CLOSING_HASHES_PATTERN = /(^|[ \t]+)#+[ \t]*$/

/** A code fence: up to three spaces, then three or more backticks or tildes. */
export const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/

/** A word: a whitespace-separated token holding a letter or a digit. */
export const WORD_PATTERN = /[\p{L}\p{N}]/u

/** What each problem says. */
export const PROBLEM_TEXT = {
	beforeFirstHeading: 'text before the first heading',
	unknownHeading: `not one of the headings ${[...REQUIRED_HEADINGS, OPTIONAL_HEADING].map((heading) => `"${heading}"`).join(', ')}`,
	headingTwice: 'heading twice',
	outOfOrder: 'heading out of order: "{heading}" comes after "{after}"',
	emptySection: 'no text under the heading',
	emptyOptional: `no text under "${OPTIONAL_HEADING}": leave it out when empty`,
	missingHeading: 'missing heading "{heading}"',
	noHeading: 'no heading in a {kind}',
	longSubject: `subject of {length} characters, at most ${SUBJECT_MAX_LENGTH}`,
	emptySubject: 'line 1 is empty: a commit starts with its subject',
	noBlankLine: 'line 2 must be blank between the subject and the body',
	pastTheCap: 'past the cap',
} as const
