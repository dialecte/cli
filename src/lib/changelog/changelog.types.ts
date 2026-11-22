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

/**
 * A section's blocks joined with its breaking items first: the joined text, or the first block the join reads otherwise
 * and the block placed before it.
 */
export type BreakingFirst =
	| { text: string }
	| { moved: SectionBlock; after: SectionBlock | undefined }

/**
 * A section of the release with its blocks joined breaking first (or the block the join reads otherwise), and where each
 * block comes from: a fragment's file, or the Unreleased part.
 */
export type OrderedSection = {
	section: ChangelogSection
	ordered: BreakingFirst
	sources: ReadonlyMap<SectionBlock, string>
}

/** A section entry of a release with where it comes from: a fragment's file, or the Unreleased part. */
export type SourcedEntry = SectionEntry & { source: string }

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
 * code fence or HTML comment (undefined when none).
 */
export type ChangelogParts = {
	lines: string[]
	parts: ChangelogPart[]
	linkLine: number | undefined
	/** The top-level lines no block covers: consumed link reference definitions, their titles included. */
	definitionLines: ReadonlySet<number>
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

/** A line of a section kept for comparison: its index in the file and its text, trailing spaces trimmed. */
export type SectionLine = { index: number; text: string }

/** A version's section read for comparison: its version, its copy rank (0 for the first), heading line, lines. */
export type VersionSection = {
	version: string
	copy: number
	heading: number
	lines: readonly SectionLine[]
}

/** The base released sections are judged against: its commit and how a finding names it. */
export type ReleaseBase = { commit: string; name: string }

/** The release base found, or the line saying why nothing is judged. */
export type ReleaseBaseRead = { base: ReleaseBase } | { notJudged: string }

/**
 * What a released-section verdict reads of git, as blob ids (`none` when absent): the base's `CHANGELOG.md` and the
 * merge-base's. A record keyed on them answers only while neither changed.
 */
export type ReleaseChangelog = { tip: string; mergeBase: string }

/**
 * A top-level block of a section's text: a `- ` bullet item, or any other block (`text`: a paragraph, a list of
 * another kind, a fence); `multiBlock` when it holds a blank line outside a fence, `breaking` for an item opening with
 * a breaking marker.
 */
export type SectionBlock = {
	kind: 'item' | 'text'
	text: string
	breaking: boolean
	multiBlock: boolean
}

/**
 * A block opened in a text that runs to its end: a code fence, an HTML block of a kind only its close ends, or a nesting
 * deeper than the reader reads; or a block or item holding raw HTML other than whole comments and balanced bare inert
 * tags (`open-html`).
 */
export type UnclosedBlock = 'fence' | 'html' | 'nesting' | 'open-html'

/**
 * A text read as CommonMark blocks: its lines (split as the parser splits them), the parser's block tokens (unclosed
 * comment openers neutralised, so they hide nothing), the line of the first HTML block holding an unclosed comment,
 * and the kind of a block that runs to the end of the text.
 */
export type MarkdownBlocks = {
	lines: string[]
	tokens: readonly MarkdownToken[]
	unclosedComment: number | undefined
	unclosedBlock: UnclosedBlock | undefined
	/** The raw HTML piece an `open-html` block names. */
	openHtml: string | undefined
	/** How many nesting levels the reader reads before it stops. */
	maxNesting: number
}

/** A parser block token as the readers use it: its type, nesting level, markup, line range, content and raw HTML. */
export type MarkdownToken = {
	type: string
	level: number
	nesting: number
	markup: string
	map: [number, number] | null
	content: string
	/** Its raw HTML pieces: an HTML block's content, an inline token's HTML tags and comments. */
	html: readonly string[]
}

/** A bare inert tag still open in a block or item: its lowered name and its text as written. */
export type OpenTag = { name: string; text: string }

/** One raw HTML piece read: the tags open after it, or the first text refused in it. */
export type PieceRead = { open: readonly OpenTag[] } | { refused: string }
