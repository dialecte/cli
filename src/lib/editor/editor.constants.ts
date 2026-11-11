import type { EditorCandidate } from './editor.types.ts'

/** The git config key whose value, when set, is the editor command (words, no flag added). */
export const EDITOR_CONFIG_KEY = 'dialecte.editor'

/**
 * The editors searched on `PATH`, in this order: the first one found as an executable file is opened, in a new
 * window. The one list; help and the README name the rule, never this list.
 */
export const EDITOR_CANDIDATES: readonly EditorCandidate[] = [
	{ word: 'code', flags: ['--new-window'] },
	{ word: 'cursor', flags: ['--new-window'] },
	{ word: 'windsurf', flags: ['--new-window'] },
	{ word: 'zed', flags: ['--new'] },
	{ word: 'subl', flags: ['--new-window'] },
	{ word: 'idea', flags: [] },
	{ word: 'webstorm', flags: [] },
]

/** The editor opened when none of the candidates is on `PATH`. */
export const DEFAULT_EDITOR: EditorCandidate = EDITOR_CANDIDATES[0]

/** The characters a backslash escapes inside a double-quoted run of `dialecte.editor`, as a shell reads it. */
export const DOUBLE_QUOTED_ESCAPABLE: readonly string[] = ['"', '\\', '$', '`']
