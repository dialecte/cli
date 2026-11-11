import { outcomeOf } from '../../../test/call-outcome.ts'
/**
 * Which editor `handover review` opens: the worktree's `dialecte.editor` git config, else the first of the fixed
 * candidates found as an executable file on the search path, else `code --new-window`; never `$EDITOR`/`$VISUAL`.
 * Every search path is built from scratch folders holding fake executables, never from the host's `PATH`.
 */
import { UNLISTED_EDITOR_WORD } from '../../../test/editor-workspace.constants.ts'
import {
	createFakeEditors,
	createFolderNamed,
	createNonExecutableFile,
	searchPathOf,
} from '../../../test/editor-workspace.ts'
import { createScratchRepository, git, isolateGitConfig } from '../../../test/scratch-repository.ts'
import { EDITOR_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { EDITOR_CANDIDATES, EDITOR_CONFIG_KEY } from './editor.constants.ts'
import { resolveEditor } from './resolve-editor.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CallOutcome } from '../../../test/call-outcome.types.ts'
import type { EditorCandidate, ResolvedEditor } from './editor.types.ts'

const PATHS = ['/work tree/one two', '/work/three']

const WORDS = EDITOR_CANDIDATES.map((candidate) => candidate.word)

/** What a resolution of the fallback answers: `code --new-window`, then the paths. */
const FALLBACK: CallOutcome<ResolvedEditor> = {
	value: { editor: 'code', command: ['code', '--new-window', ...PATHS] },
}

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A repository whose `dialecte.editor` is `editor` when given, else unset. */
function worktreeConfigured(params: { editor?: string }): string {
	isolateGitConfig()
	const root = createScratchRepository()
	if (params.editor !== undefined) git({ root, args: ['config', EDITOR_CONFIG_KEY, params.editor] })
	return root
}

/** The editor resolved in a repository with `editor` configured (or not), searching `folders` as the `PATH`. */
function resolved(params: {
	editor?: string
	folders: readonly string[]
	paths?: readonly string[]
}): CallOutcome<ResolvedEditor> {
	return outcomeOf(() =>
		resolveEditor({
			cwd: worktreeConfigured({ editor: params.editor }),
			searchPath: searchPathOf(params.folders),
			paths: params.paths ?? PATHS,
		}),
	)
}

/** The candidate at `index`, which is there: the registry is read, never restated. */
function candidateAt(index: number): EditorCandidate {
	return EDITOR_CANDIDATES[index]
}

/** What resolving finds when `candidate` is the executable `folder` holds: its file, its flags, then the paths. */
function foundOutcome(params: {
	folder: string
	candidate: EditorCandidate
}): CallOutcome<ResolvedEditor> {
	const { candidate } = params
	return {
		value: {
			editor: candidate.word,
			command: [`${params.folder}/${candidate.word}`, ...candidate.flags, ...PATHS],
		},
	}
}

describe('resolveEditor: dialecte.editor set', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	const CONFIGURED: Record<
		string,
		{ value: string; paths: string[]; command: string[]; editor: string }
	> = {
		'one word, two paths -> the word then the paths, no flag added': {
			value: 'my-editor',
			paths: PATHS,
			command: ['my-editor', ...PATHS],
			editor: 'my-editor',
		},
		'several words -> its words as written, then the paths, no flag added': {
			value: 'my-editor --wait --reuse-window',
			paths: PATHS,
			command: ['my-editor', '--wait', '--reuse-window', ...PATHS],
			editor: 'my-editor',
		},
		'double and single quoted runs -> each quoted run is one word': {
			value: `my-editor --title "two words" 'single quoted'`,
			paths: PATHS,
			command: ['my-editor', '--title', 'two words', 'single quoted', ...PATHS],
			editor: 'my-editor',
		},
		'an absolute path with a flag -> the editor word is that path': {
			value: '/opt/tools/my-editor --new',
			paths: PATHS,
			command: ['/opt/tools/my-editor', '--new', ...PATHS],
			editor: '/opt/tools/my-editor',
		},
		'no path to open -> the words alone': {
			value: 'my-editor --wait',
			paths: [],
			command: ['my-editor', '--wait'],
			editor: 'my-editor',
		},
	}

	for (const [title, row] of Object.entries(CONFIGURED))
		it(title, () => {
			expect(resolved({ editor: row.value, folders: [], paths: row.paths })).toEqual({
				value: { editor: row.editor, command: row.command },
			})
		})

	it('a candidate of the list on the search path too -> the configured editor, never the candidate', () => {
		const editors = createFakeEditors({ words: [candidateAt(0).word] })

		const { value } = CONFIGURED['no path to open -> the words alone']

		expect(resolved({ editor: value, folders: [editors.folder] })).toEqual({
			value: { editor: 'my-editor', command: ['my-editor', '--wait', ...PATHS] },
		})
	})
})

describe('resolveEditor: dialecte.editor unset', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	const ALONE: Record<string, EditorCandidate> = Object.fromEntries(
		EDITOR_CANDIDATES.map((candidate) => [
			`only ${candidate.word} on the search path -> that executable with its new-window flag`,
			candidate,
		]),
	)

	for (const [title, candidate] of Object.entries(ALONE))
		it(title, () => {
			const editors = createFakeEditors({ words: [candidate.word] })

			expect(resolved({ folders: [editors.folder] })).toEqual(
				foundOutcome({ folder: editors.folder, candidate }),
			)
		})

	it('every candidate on the search path -> the first of the list', () => {
		const editors = createFakeEditors({ words: [...WORDS].reverse() })

		expect(resolved({ folders: [editors.folder] })).toEqual(
			foundOutcome({ folder: editors.folder, candidate: candidateAt(0) }),
		)
	})

	const LOSES: Record<string, number> = Object.fromEntries(
		WORDS.slice(1).map((word, index) => [
			`${word} in the first folder, the candidate before it in a later one -> the earlier of the list`,
			index + 1,
		]),
	)

	for (const [title, later] of Object.entries(LOSES))
		it(title, () => {
			const first = createFakeEditors({ words: [candidateAt(later).word] })
			const second = createFakeEditors({ words: [candidateAt(later - 1).word] })

			expect(resolved({ folders: [first.folder, second.folder] })).toEqual(
				foundOutcome({ folder: second.folder, candidate: candidateAt(later - 1) }),
			)
		})

	it('a candidate only in the second folder of the search path -> found there', () => {
		const unrelated = createFakeEditors({ words: [UNLISTED_EDITOR_WORD] })
		const editors = createFakeEditors({ words: [candidateAt(1).word] })

		expect(resolved({ folders: [unrelated.folder, editors.folder] })).toEqual(
			foundOutcome({ folder: editors.folder, candidate: candidateAt(1) }),
		)
	})

	it('none of the list on the search path -> code --new-window', () => {
		const unrelated = createFakeEditors({ words: [UNLISTED_EDITOR_WORD] })

		expect(resolved({ folders: [unrelated.folder] })).toEqual(FALLBACK)
	})

	it('a search path with no folder -> code --new-window', () => {
		expect(resolved({ folders: [] })).toEqual(FALLBACK)
	})

	it('$EDITOR and $VISUAL naming an executable of the search path that is on no list -> never used: code --new-window', () => {
		vi.stubEnv('EDITOR', UNLISTED_EDITOR_WORD)
		vi.stubEnv('VISUAL', UNLISTED_EDITOR_WORD)
		const unrelated = createFakeEditors({ words: [UNLISTED_EDITOR_WORD] })

		expect(resolved({ folders: [unrelated.folder] })).toEqual(FALLBACK)
	})

	it('$EDITOR and $VISUAL set and a candidate on the search path -> the candidate', () => {
		vi.stubEnv('EDITOR', UNLISTED_EDITOR_WORD)
		vi.stubEnv('VISUAL', UNLISTED_EDITOR_WORD)
		const editors = createFakeEditors({ words: [UNLISTED_EDITOR_WORD, candidateAt(2).word] })

		expect(resolved({ folders: [editors.folder] })).toEqual(
			foundOutcome({ folder: editors.folder, candidate: candidateAt(2) }),
		)
	})

	it('the first candidate is a folder on the search path, the second an executable -> the folder is skipped, the second is opened', () => {
		const folderNamed = createFolderNamed({ word: candidateAt(0).word })
		const editors = createFakeEditors({ words: [candidateAt(1).word] })

		expect(resolved({ folders: [folderNamed, editors.folder] })).toEqual(
			foundOutcome({ folder: editors.folder, candidate: candidateAt(1) }),
		)
	})

	it('the first candidate is a file that is not executable, the second an executable -> the file is skipped, the second is opened', () => {
		const plain = createNonExecutableFile({ word: candidateAt(0).word })
		const editors = createFakeEditors({ words: [candidateAt(1).word] })

		expect(resolved({ folders: [plain, editors.folder] })).toEqual(
			foundOutcome({ folder: editors.folder, candidate: candidateAt(1) }),
		)
	})

	it('a folder and a file that is not executable as the only candidates -> code --new-window', () => {
		const folderNamed = createFolderNamed({ word: candidateAt(3).word })
		const plain = createNonExecutableFile({ word: candidateAt(4).word })

		expect(resolved({ folders: [folderNamed, plain] })).toEqual(FALLBACK)
	})

	it('no PATH at all -> code --new-window', () => {
		expect(
			outcomeOf(() =>
				resolveEditor({ cwd: worktreeConfigured({}), searchPath: undefined, paths: PATHS }),
			),
		).toEqual(FALLBACK)
	})
})
