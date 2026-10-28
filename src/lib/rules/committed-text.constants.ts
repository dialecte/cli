import type { ReferencePattern } from './committed-text.types.ts'

/**
 * Text that never goes in a committed file or a commit message, in any package: plan, lot or ticket
 * tags, and citations of a standard by clause, table, annex or section sign. A package adds its own
 * (its standard's document names) under `"dialecte": { "referencePatterns": [...] }` in package.json.
 *
 * One list for `dialecte rules` and the `dialecte handover` scripts, which read it with `grep -E`:
 * each source stays an extended regular expression both read alike.
 */
export const GENERIC_REFERENCE_PATTERNS: readonly ReferencePattern[] = [
	{ label: 'plan tag', source: '\\blot [A-Z0-9]' },
	{ label: 'acceptance criterion', source: '\\bAC[0-9]' },
	// digits up to a word boundary: `#1234ab`, a colour, is not a ticket
	{ label: 'ticket number', source: '#[0-9]{3,}\\b' },
	{ label: 'section citation', source: '§ ?[0-9]' },
	{ label: 'table citation', source: 'Tables? [0-9]' },
	{ label: 'annex citation', source: 'Annex [A-Z]' },
	{ label: 'clause citation', source: '[Cc]lause [0-9]' },
]

/** Style and image files: a hex colour such as `#fff` is never a ticket. No reference is looked for in them. */
export const REFERENCE_FREE_EXTENSIONS: readonly string[] = ['css', 'scss', 'sass', 'less', 'svg']
