import type { CHANGELOG_SECTIONS } from './changelog.constants.ts'

/** One of the changelog's sections. */
export type ChangelogSection = (typeof CHANGELOG_SECTIONS)[number]

/** A section of a fragment (or of the Unreleased part): its name and its text, trimmed. */
export type SectionEntry = { section: ChangelogSection; text: string }

/** A fragment read: its path relative to the package root, its sections in the order written. */
export type Fragment = { file: string; sections: SectionEntry[] }

/** A fragment that cannot be folded, and why. */
export type FragmentProblem = { file: string; problem: string }

/** A no-entry note: its path and why the change has no changelog entry. */
export type NoEntryNote = { file: string; reason: string }

/** The fragments and no-entry notes of a package, in file name order, and the problems of those that cannot be read. */
export type FragmentsRead = {
	fragments: Fragment[]
	notes: NoEntryNote[]
	problems: FragmentProblem[]
}

/** Whether a change brings the fragment it asks for: passed with what answered (`note`), or failed with why. */
export type FragmentCheck =
	| { status: 'passed'; note: string }
	| { status: 'failed'; reason: string }

/** The changelog after a release fold, or why the fold is refused. */
export type FoldResult = { text: string } | { refusal: string }

/** How `readSections` treats what a fragment refuses: a repeated section, text before the first heading. */
export type SectionsMode = 'fragment' | 'unreleased'

/** The sections of a text, and the text before the first heading (`unreleased` mode only; empty otherwise). */
export type SectionsRead = { sections: SectionEntry[]; leading: string } | { problem: string }

/** A part of a changelog: the Unreleased part or a version's section, from its heading line to its end (excluded). */
export type ChangelogPart =
	| { kind: 'unreleased'; heading: number; end: number }
	| { kind: 'version'; version: string; heading: number; end: number }

/** A line where a part ends: it opens the Unreleased part, a version's section, or nothing (a link reference line). */
export type PartBoundary = { index: number; opens: 'unreleased' | 'nothing' | { version: string } }

/**
 * A changelog read into parts: its lines (LF), its parts in file order, and its first link reference line outside a
 * code fence (undefined when none).
 */
export type ChangelogParts = {
	lines: string[]
	parts: ChangelogPart[]
	linkLine: number | undefined
}

/**
 * A released section the change altered: lines added or removed (`reordered` when the same lines stand in another
 * order), a section the base holds that the checked text lacks, or a version heading the checked text holds more times
 * than the base. `line` is the 1-based line of the checked text the finding stands at.
 */
export type ReleasedSectionChange =
	| {
			kind: 'changed'
			version: string
			line: number
			added: number
			removed: number
			reordered: boolean
	  }
	| { kind: 'removed'; version: string; line: number; removed: number }
	| { kind: 'duplicated'; version: string; line: number }

/** The three texts of a `CHANGELOG.md` the released-section verdict reads; `mergeBase` absent in a two-way call. */
export type ReleasedSectionTexts = {
	checked: string | undefined
	tip: string | undefined
	mergeBase?: string | undefined
}

/** A version's section read for comparison: its version, its copy rank (0 for the first), heading line, lines. */
export type VersionSection = { version: string; copy: number; heading: number; lines: string[] }

/** The base released sections are judged against: its commit and how a finding names it. */
export type ReleaseBase = { commit: string; name: string }

/** The release base found, or the line saying why nothing is judged. */
export type ReleaseBaseRead = { base: ReleaseBase } | { notJudged: string }

/**
 * What a released-section verdict reads of git, as blob ids (`none` when absent): the base's `CHANGELOG.md` and the
 * merge-base's. A record keyed on them answers only while neither changed.
 */
export type ReleaseChangelog = { tip: string; mergeBase: string }
