/**
 * The checks of a GitHub text's human part (every line before the recap's `<details`): the fixed headings
 * of a pull request or an issue, no heading in a comment or a commit, a commit's subject line, and the word
 * cap of its kind. Fenced code blocks hold no heading and no counted word: commands to copy are not prose.
 */
import {
	CLOSING_HASHES_PATTERN,
	FENCE_PATTERN,
	HEADED_KINDS,
	HEADING_PATTERN,
	OPTIONAL_HEADING,
	PROBLEM_TEXT,
	RECAP_START,
	REQUIRED_HEADINGS,
	SUBJECT_MAX_LENGTH,
	WORD_CAPS,
	WORD_PATTERN,
} from './text-check.constants.ts'

import type { OverCap, TextCheck, TextKind, TextLine, TextProblem } from './text-check.types.ts'

export function checkText(params: { text: string; kind: TextKind }): TextCheck {
	const { kind } = params
	const lines = readHumanPart(params.text)
	const isCommit = kind === 'commit'
	const shapeProblems = HEADED_KINDS.includes(kind)
		? checkHeadings(lines)
		: [...headingLineProblems({ lines, kind }), ...(isCommit ? checkSubject(lines) : [])]
	const lineProblems = shapeProblems
		.filter((problem) => problem.line)
		.sort((first, second) => (first.line?.number ?? 0) - (second.line?.number ?? 0))
	const counted = lines.filter(
		(line) => !line.fenced && line.heading === undefined && !(isCommit && line.number === 1),
	)
	const cap = WORD_CAPS[kind]
	const overCap = findOverCap({ lines: counted, cap })
	return {
		words: counted.reduce((total, line) => total + countWords(line.text), 0),
		cap,
		problems: [...lineProblems, ...shapeProblems.filter((problem) => !problem.line)],
		...(overCap && { overCap }),
	}
}

/** The lines before the first one starting with `<details`, each marked fenced or heading. */
function readHumanPart(text: string): TextLine[] {
	const lines: TextLine[] = []
	let fence: string | undefined
	for (const [index, raw] of text.split('\n').entries()) {
		const line = raw.replace(/\r$/, '')
		if (line.trim().startsWith(RECAP_START)) break
		const fenceMark = FENCE_PATTERN.exec(line)?.[1]
		if (fence !== undefined) {
			if (
				fenceMark &&
				fenceMark[0] === fence[0] &&
				fenceMark.length >= fence.length &&
				!line.trim().slice(fenceMark.length).trim()
			)
				fence = undefined
			lines.push({ number: index + 1, text: line, fenced: true })
			continue
		}
		if (fenceMark) {
			fence = fenceMark
			lines.push({ number: index + 1, text: line, fenced: true })
			continue
		}
		const heading = HEADING_PATTERN.exec(line)
		lines.push({
			number: index + 1,
			text: line,
			fenced: false,
			...(heading && { heading: (heading[2] ?? '').replace(CLOSING_HASHES_PATTERN, '').trim() }),
		})
	}
	return lines
}

/**
 * A pull request's or an issue's headings: `What changes`, `Why`, `How to check it` in this order, then
 * `Watch out` when it has something to say; each with text under it; nothing before the first heading.
 */
function checkHeadings(lines: TextLine[]): TextProblem[] {
	const order = [...REQUIRED_HEADINGS, OPTIONAL_HEADING]
	const keys = order.map((heading) => heading.toLowerCase())
	const problems: TextProblem[] = []
	const seen = new Set<number>()
	let latest = -1
	let headingMet = false
	for (const [position, line] of lines.entries()) {
		if (line.heading === undefined) {
			if (!headingMet && line.text.trim())
				problems.push({ line, what: PROBLEM_TEXT.beforeFirstHeading })
			continue
		}
		headingMet = true
		const index = keys.indexOf(line.heading.toLowerCase())
		if (index < 0) {
			problems.push({ line, what: PROBLEM_TEXT.unknownHeading })
			continue
		}
		if (seen.has(index)) {
			problems.push({ line, what: PROBLEM_TEXT.headingTwice })
			continue
		}
		seen.add(index)
		if (index < latest)
			problems.push({
				line,
				what: PROBLEM_TEXT.outOfOrder
					.replace('{heading}', order[index])
					.replace('{after}', order[latest]),
			})
		else latest = index
		if (!sectionHasText({ lines, position }))
			problems.push({
				line,
				what:
					order[index] === OPTIONAL_HEADING
						? PROBLEM_TEXT.emptyOptional
						: PROBLEM_TEXT.emptySection,
			})
	}
	const missing = REQUIRED_HEADINGS.filter((_, index) => !seen.has(index))
	return [
		...problems,
		...missing.map((heading) => ({
			what: PROBLEM_TEXT.missingHeading.replace('{heading}', heading),
		})),
	]
}

/** A non-blank line between the heading at `position` and the next heading. */
function sectionHasText(params: { lines: TextLine[]; position: number }): boolean {
	for (const line of params.lines.slice(params.position + 1)) {
		if (line.heading !== undefined) return false
		if (line.text.trim()) return true
	}
	return false
}

/** A comment or a commit holds no heading: each heading line (a commit's subject aside). */
function headingLineProblems(params: { lines: TextLine[]; kind: TextKind }): TextProblem[] {
	return params.lines
		.filter(
			(line) => line.heading !== undefined && !(params.kind === 'commit' && line.number === 1),
		)
		.map((line) => ({ line, what: PROBLEM_TEXT.noHeading.replace('{kind}', params.kind) }))
}

/**
 * A commit's line 1 is its subject, not empty, at most 72 characters; when a body follows, line 2 is blank.
 * An empty line 1 is the one problem: no subject, no line between a subject and a body.
 */
function checkSubject(lines: TextLine[]): TextProblem[] {
	const problems: TextProblem[] = []
	const [subject, second] = lines
	if (!subject?.text.trim())
		return subject ? [{ line: subject, what: PROBLEM_TEXT.emptySubject }] : []
	const length = subject ? [...subject.text].length : 0
	if (subject && length > SUBJECT_MAX_LENGTH)
		problems.push({
			line: subject,
			what: PROBLEM_TEXT.longSubject.replace('{length}', String(length)),
		})
	if (second?.text.trim()) problems.push({ line: second, what: PROBLEM_TEXT.noBlankLine })
	return problems
}

/** The whitespace-separated tokens of `text` holding a letter or a digit. */
function countWords(text: string): number {
	return text.split(/\s+/).filter((token) => WORD_PATTERN.test(token)).length
}

/**
 * Past the cap: the count, the cap, every line holding a word from the one where the count passes the
 * cap to the last one; undefined within the cap.
 */
function findOverCap(params: { lines: TextLine[]; cap: number }): OverCap | undefined {
	let total = 0
	let passedAt: number | undefined
	for (const [index, line] of params.lines.entries()) {
		total += countWords(line.text)
		if (passedAt === undefined && total > params.cap) passedAt = index
	}
	if (passedAt === undefined) return undefined
	return {
		words: total,
		cap: params.cap,
		lines: params.lines.slice(passedAt).filter((line) => countWords(line.text) > 0),
	}
}
