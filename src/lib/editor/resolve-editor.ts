import { readGitConfig } from '../git.ts'
import { DEFAULT_EDITOR, EDITOR_CANDIDATES, EDITOR_CONFIG_KEY } from './editor.constants.ts'
import { findExecutable } from './find-executable.ts'
import { splitWords } from './split-words.ts'

import type { ResolveEditorParams, ResolvedEditor } from './editor.types.ts'

/**
 * The editor to open `paths` in a new window: the words of the worktree's `dialecte.editor` git config when set
 * (no flag added), else the first of the fixed candidates found as an executable file on the search path (its
 * command is the file found), else `code --new-window`. Never `$EDITOR` nor `$VISUAL`.
 */
export function resolveEditor(params: ResolveEditorParams): ResolvedEditor {
	const { paths } = params
	const configured = splitWords(readGitConfig({ root: params.cwd, key: EDITOR_CONFIG_KEY }) ?? '')
	if (configured.length) return { editor: configured[0], command: [...configured, ...paths] }
	for (const candidate of EDITOR_CANDIDATES) {
		const found = findExecutable({
			word: candidate.word,
			searchPath: params.searchPath,
			cwd: params.cwd,
		})
		if (found) return { editor: candidate.word, command: [found, ...candidate.flags, ...paths] }
	}
	return {
		editor: DEFAULT_EDITOR.word,
		command: [DEFAULT_EDITOR.word, ...DEFAULT_EDITOR.flags, ...paths],
	}
}
