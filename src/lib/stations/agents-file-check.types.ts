/**
 * What a sync did with the session-check section of `AGENTS.md`:
 * - `added` (the section appended to an existing file), `created` (a new file holding only the section),
 * - `updated` (an older body replaced between the markers), `unchanged` (the same sentence),
 * - `kept` (the sync would not write the section and one is there: left in place, never removed),
 * - `missing` (the sync would write it, there is no file and creating was not granted),
 * - `absent` (the sync would not write it and there is none),
 * - `unclosed` (a marker without its pair, or a doubled marker: the file is left alone).
 */
export type AgentsFileCheckState =
	| 'added'
	| 'created'
	| 'updated'
	| 'unchanged'
	| 'kept'
	| 'missing'
	| 'absent'
	| 'unclosed'

/** Where the section sits in a text: the start of its start marker, the end of its end marker. */
export type SectionSpan = { start: number; end: number }
