/**
 * What a sync did with the session-check section of `AGENTS.md`: `added` (new section, or a new file),
 * `updated` (an older body replaced), `removed`, `unchanged`, `unclosed` (a marker without its pair, or a doubled
 * marker: the file is left alone).
 */
export type AgentsFileCheckState = 'added' | 'updated' | 'removed' | 'unchanged' | 'unclosed'

/** Where the section sits in a text: the start of its start marker, the end of its end marker. */
export type SectionSpan = { start: number; end: number }
