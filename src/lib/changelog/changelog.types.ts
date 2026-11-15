import type { CHANGELOG_SECTIONS } from './changelog.constants.ts'

/** One of the changelog's sections. */
export type ChangelogSection = (typeof CHANGELOG_SECTIONS)[number]

/** A section of a fragment (or of the Unreleased part): its name and its text, trimmed. */
export type SectionEntry = { section: ChangelogSection; text: string }

/** A fragment read: its path relative to the package root, its sections in the order written. */
export type Fragment = { file: string; sections: SectionEntry[] }

/** A fragment that cannot be folded, and why. */
export type FragmentProblem = { file: string; problem: string }

/** The fragments of a package, in file name order, and the problems of those that cannot be read. */
export type FragmentsRead = { fragments: Fragment[]; problems: FragmentProblem[] }

/** The changelog after a release fold, or why the fold is refused. */
export type FoldResult = { text: string } | { refusal: string }

/** How `readSections` treats what a fragment refuses: a repeated section, text before the first heading. */
export type SectionsMode = 'fragment' | 'unreleased'

/** The sections of a text, and the text before the first heading (`unreleased` mode only; empty otherwise). */
export type SectionsRead = { sections: SectionEntry[]; leading: string } | { problem: string }
