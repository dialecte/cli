/** The release fold: the Unreleased entries and the fragments become the new version's section of the changelog. */
import {
	CHANGELOG_SECTIONS,
	CODE_FENCE_PATTERN,
	FOLD_REFUSALS,
	LINK_REFERENCE_PATTERN,
	UNRELEASED_HEADING,
	UNRELEASED_HEADING_PATTERN,
	VERSION_HEADING_PATTERN,
} from './changelog.constants.ts'
import { readSections } from './sections.ts'

import type { FoldResult, Fragment, SectionEntry, SectionsRead } from './changelog.types.ts'

/**
 * `text` (a changelog, LF or CRLF) with `## [<version>] - <date>` written under an emptied `## [Unreleased]`: the
 * Unreleased part's summary (its text before the first section) first, then each section in the changelog's order,
 * holding the Unreleased entries, then each fragment's in the fragments' order, one per line. A changelog with no
 * Unreleased heading gets one above its first version (or its link block, or at its end). Refused when the version is
 * already there, the Unreleased part cannot be read, or there is nothing to release.
 *
 * @intent write a release's changelog section from the fragments
 * @internal
 */
export function foldChangelog(params: {
	text: string
	version: string
	date: string
	fragments: readonly Fragment[]
}): FoldResult {
	const lines = params.text.replace(/\r\n/g, '\n').split('\n')
	const kinds = lineKinds({ lines })
	if (lines.some((line, index) => kinds[index] && line.startsWith(`## [${params.version}]`)))
		return { refusal: FOLD_REFUSALS.released.replace('{version}', params.version) }
	const part = unreleasedPart({ lines, kinds })
	const unreleased = readUnreleased({ lines: lines.slice(part.from, part.to) })
	if ('problem' in unreleased)
		return { refusal: FOLD_REFUSALS.unreleased.replace('{problem}', unreleased.problem) }
	const entries = [
		...unreleased.sections,
		...params.fragments.flatMap((fragment) => fragment.sections),
	]
	if (entries.length === 0 && unreleased.leading === '') return { refusal: FOLD_REFUSALS.nothing }
	const release = [
		`## [${params.version}] - ${params.date}`,
		'',
		...(unreleased.leading === '' ? [] : [unreleased.leading, '']),
		...renderSections({ entries }),
	]
	const before = trimTrailingBlank({ lines: lines.slice(0, part.heading) })
	return {
		text: [
			...before,
			...(before.length > 0 ? [''] : []),
			UNRELEASED_HEADING,
			'',
			...release,
			...lines.slice(part.to),
		].join('\n'),
	}
}

/**
 * The Unreleased part of the changelog `text` read as `foldChangelog` reads it: its summary and its sections (a
 * repeated section merged), or the problem that refuses a release.
 *
 * @intent check the Unreleased part before a release folds it
 * @internal
 */
export function readUnreleasedOf(params: { text: string }): SectionsRead {
	const lines = params.text.replace(/\r\n/g, '\n').split('\n')
	const part = unreleasedPart({ lines, kinds: lineKinds({ lines }) })
	return readUnreleased({ lines: lines.slice(part.from, part.to) })
}

/** For each line, whether it is outside a code fence (a heading there is a heading). */
function lineKinds(params: { lines: readonly string[] }): boolean[] {
	let fenced = false
	return params.lines.map(function outsideFence(line) {
		const outside = !fenced
		if (CODE_FENCE_PATTERN.test(line)) fenced = !fenced
		return outside
	})
}

/**
 * Where the Unreleased part is: its heading line (`heading`, where a missing one is inserted), its first and its
 * end line (excluded): up to the next version heading or the link block, outside code fences.
 */
function unreleasedPart(params: { lines: readonly string[]; kinds: readonly boolean[] }): {
	heading: number
	from: number
	to: number
} {
	const { lines, kinds } = params
	function ends(params: { line: string; index: number }): boolean {
		const { line, index } = params
		return kinds[index] && (VERSION_HEADING_PATTERN.test(line) || LINK_REFERENCE_PATTERN.test(line))
	}
	const found = lines.findIndex(
		(line, index) => kinds[index] && UNRELEASED_HEADING_PATTERN.test(line),
	)
	if (found === -1) {
		const end = lines.findIndex((line, index) => ends({ line, index }))
		const at = end === -1 ? lines.length : end
		return { heading: at, from: at, to: at }
	}
	const next = lines.findIndex((line, index) => index > found && ends({ line, index }))
	return { heading: found, from: found + 1, to: next === -1 ? lines.length : next }
}

function readUnreleased(params: { lines: readonly string[] }): SectionsRead {
	return readSections({ text: params.lines.join('\n'), mode: 'unreleased' })
}

/** Each section that holds entries, in the changelog's order: its heading, a blank line, its entries, a blank line. */
function renderSections(params: { entries: readonly SectionEntry[] }): string[] {
	return CHANGELOG_SECTIONS.flatMap(function sectionLines(section) {
		const texts = params.entries
			.filter((entry) => entry.section === section)
			.map((entry) => entry.text)
		return texts.length === 0 ? [] : [`### ${section}`, '', texts.join('\n'), '']
	})
}

function trimTrailingBlank(params: { lines: readonly string[] }): string[] {
	const kept = [...params.lines]
	while (kept.length > 0 && kept.at(-1)?.trim() === '') kept.pop()
	return kept
}
