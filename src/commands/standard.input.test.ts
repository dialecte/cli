import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	GIT_FOLDER,
	LAYOUT_MARKER,
	SAMPLE_WORD,
	WORK_TREE_MARKER,
} from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	createStandardWorkspace,
	entriesOf,
	sampleStandardText,
	trimmedLinesOf,
	writeStandards,
	writeTextFile,
} from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { describe, expect, it } from 'vitest'

import type {
	StandardsDescription,
	StandardWorkspace,
} from '../../test/standard-workspace.types.ts'

const SAMPLE = sampleStandardText({ word: SAMPLE_WORD })

type RefusalCase = {
	standards: StandardsDescription
	prepare?: (workspace: StandardWorkspace) => void
	environment: (workspace: StandardWorkspace) => NodeJS.ProcessEnv
	/** Strings the refusal holds. */
	mentions: string[]
}

/** The environment of the workspace with DIALECTE_STANDARD set to `root`, or not set when `root` is left out. */
function withRoot(params: { workspace: StandardWorkspace; root?: string }): NodeJS.ProcessEnv {
	return {
		XDG_CACHE_HOME: params.workspace.cache,
		HOME: params.workspace.home,
		...(params.root === undefined ? {} : { DIALECTE_STANDARD: params.root }),
	}
}

describe('standard index: a root that is no usable root → exit 2, nothing built', () => {
	const testCases: Record<string, RefusalCase> = {
		'DIALECTE_STANDARD not set → exit 2 saying how to set it': {
			standards: { alpha: { 'one.md': SAMPLE } },
			environment: (workspace) => withRoot({ workspace }),
			mentions: ['DIALECTE_STANDARD'],
		},
		'DIALECTE_STANDARD empty → exit 2 saying how to set it': {
			standards: { alpha: { 'one.md': SAMPLE } },
			environment: (workspace) => withRoot({ workspace, root: '' }),
			mentions: ['DIALECTE_STANDARD'],
		},
		'DIALECTE_STANDARD naming a path that does not exist → exit 2 saying how to set it': {
			standards: {},
			environment: (workspace) => withRoot({ workspace, root: join(workspace.base, 'missing') }),
			mentions: ['DIALECTE_STANDARD'],
		},
		'the root a file → exit 2 saying how to set it': {
			standards: {},
			prepare: (workspace) =>
				writeTextFile({ path: join(workspace.base, 'flat.md'), text: SAMPLE }),
			environment: (workspace) => withRoot({ workspace, root: join(workspace.base, 'flat.md') }),
			mentions: ['DIALECTE_STANDARD'],
		},
		'.md files directly in the root and no folder → exit 2 naming them': {
			standards: {},
			prepare: (workspace) => {
				writeTextFile({ path: join(workspace.root, 'first-part.md'), text: SAMPLE })
				writeTextFile({ path: join(workspace.root, 'second-part.md'), text: SAMPLE })
			},
			environment: (workspace) => withRoot({ workspace, root: workspace.root }),
			mentions: ['first-part.md', 'second-part.md'],
		},
		'.md files directly in the root next to a standard folder → exit 2 naming them, no fallback': {
			standards: { alpha: { 'one.md': SAMPLE } },
			prepare: (workspace) =>
				writeTextFile({ path: join(workspace.root, 'stray-part.md'), text: SAMPLE }),
			environment: (workspace) => withRoot({ workspace, root: workspace.root }),
			mentions: ['stray-part.md'],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(
			title,
			async () => {
				const workspace = createStandardWorkspace({ standards: testCase.standards })
				testCase.prepare?.(workspace)

				const answer = await answeredWith({
					run: runStandard({
						argv: ['index'],
						cwd: workspace.cwd,
						environment: testCase.environment(workspace),
					}),
					exitCode: 2,
				})

				for (const mention of testCase.mentions) expect(answer.output).toContain(mention)
				expect(answer.output).toContain(LAYOUT_MARKER)
				expect(entriesOf(workspace.cache)).toEqual([])
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
	}
})

type SelectionCase = {
	standards: StandardsDescription
	prepare?: (workspace: StandardWorkspace) => void
	expected: { standards: string[]; fileIds: string[] }
}

/** The standard ids and file ids the `index` text lists, in order. */
function listedBy(output: string): { standards: string[]; fileIds: string[] } {
	const lines = trimmedLinesOf(output)
	return {
		standards: lines.flatMap((line) => /^(\S+) {2}\d+ files {2}/u.exec(line)?.[1] ?? []),
		fileIds: lines.flatMap((line) => /^(\S+\/\S+) {2}\d+ lines {2}/u.exec(line)?.[1] ?? []),
	}
}

describe('every verb: no standard configured → exit 2 saying how to set it', () => {
	const testCases: Record<string, string[]> = {
		find: ['find', SAMPLE_WORD],
		show: ['show', 'alpha/one:1-2'],
		eval: ['eval', 'gold.jsonl'],
	}

	for (const [verb, argv] of Object.entries(testCases))
		it(
			`${verb} → exit 2 naming DIALECTE_STANDARD and the layout`,
			async () => {
				const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SAMPLE } } })
				writeTextFile({ path: join(workspace.cwd, 'gold.jsonl'), text: '' })

				const answer = await answeredWith({
					run: runStandard({ argv, cwd: workspace.cwd, environment: withRoot({ workspace }) }),
					exitCode: 2,
				})

				expect(answer.output).toContain('DIALECTE_STANDARD')
				expect(answer.output).toContain(LAYOUT_MARKER)
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

	it(
		'index with a flag it does not know → exit 2, the message starting with "standard index:"',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SAMPLE } } })

			const answer = await answeredWith({
				run: runStandard({
					argv: ['index', '--bogus'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 2,
			})

			expect(answer.output.startsWith('standard index:')).toBe(true)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('index and find: a root holding no standard folder → exit 2 with the layout, nothing built', () => {
	const testCases: Record<string, string[]> = {
		index: ['index'],
		find: ['find', SAMPLE_WORD],
	}

	for (const [verb, argv] of Object.entries(testCases))
		it(
			`${verb} → exit 2 naming DIALECTE_STANDARD and the layout`,
			async () => {
				const workspace = createStandardWorkspace()

				const answer = await answeredWith({
					run: runStandard({
						argv,
						cwd: workspace.cwd,
						environment: workspace.environment,
					}),
					exitCode: 2,
				})

				expect(answer.output).toContain('DIALECTE_STANDARD')
				expect(answer.output).toContain(LAYOUT_MARKER)
				expect(entriesOf(workspace.cache)).toEqual([])
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
})

describe('standard index: which folders and files are standards and files', () => {
	const testCases: Record<string, SelectionCase> = {
		'hidden folders and hidden files → skipped': {
			standards: {
				alpha: { 'one.md': SAMPLE, '.secret.md': SAMPLE },
				'.hidden': { 'two.md': SAMPLE },
			},
			expected: { standards: ['alpha'], fileIds: ['alpha/one'] },
		},
		'files that do not end in .md → ignored': {
			standards: { alpha: { 'one.md': SAMPLE, 'notes.txt': SAMPLE, readme: SAMPLE } },
			expected: { standards: ['alpha'], fileIds: ['alpha/one'] },
		},
		'a symlink to a folder → a standard of its own name': {
			standards: { alpha: { 'one.md': SAMPLE } },
			prepare: (workspace) => {
				const target = join(workspace.base, 'elsewhere')
				writeTextFile({ path: join(target, 'one.md'), text: SAMPLE })
				symlinkSync(target, join(workspace.root, 'gamma'), 'dir')
			},
			expected: { standards: ['alpha', 'gamma'], fileIds: ['alpha/one', 'gamma/one'] },
		},
		'a symlink to a .md file → a file of its own name': {
			standards: { alpha: { 'one.md': SAMPLE } },
			prepare: (workspace) => {
				const target = join(workspace.base, 'linked-target.md')
				writeFileSync(target, SAMPLE)
				symlinkSync(target, join(workspace.root, 'alpha', 'linked.md'))
			},
			expected: { standards: ['alpha'], fileIds: ['alpha/linked', 'alpha/one'] },
		},
		'a subfolder inside a standard folder → ignored with its files': {
			standards: { alpha: { 'one.md': SAMPLE, 'nested/deep.md': SAMPLE } },
			expected: { standards: ['alpha'], fileIds: ['alpha/one'] },
		},
		'a hidden folder inside a standard folder holding a .md file → skipped': {
			standards: { alpha: { 'one.md': SAMPLE, '.sources/raw.md': SAMPLE } },
			expected: { standards: ['alpha'], fileIds: ['alpha/one'] },
		},
		'file names starting with a number and a dash → ids with the whole name': {
			standards: { alpha: { '6-amd.md': SAMPLE, '80-1.md': SAMPLE } },
			expected: { standards: ['alpha'], fileIds: ['alpha/6-amd', 'alpha/80-1'] },
		},
		'a folder and a file written in capitals → ids lowercased': {
			standards: { Alpha: { 'One.md': SAMPLE } },
			expected: { standards: ['alpha'], fileIds: ['alpha/one'] },
		},
		'two standard folders holding a file of the same name → both indexed, ids told apart by folder':
			{
				standards: { alpha: { 'part.md': SAMPLE }, beta: { 'part.md': SAMPLE } },
				expected: { standards: ['alpha', 'beta'], fileIds: ['alpha/part', 'beta/part'] },
			},
		'a hidden file next to the folders in the root → not a stray top-level file': {
			standards: { alpha: { 'one.md': SAMPLE } },
			prepare: (workspace) =>
				writeTextFile({ path: join(workspace.root, '.hidden-notes.md'), text: SAMPLE }),
			expected: { standards: ['alpha'], fileIds: ['alpha/one'] },
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(
			title,
			async () => {
				const workspace = createStandardWorkspace({ standards: testCase.standards })
				testCase.prepare?.(workspace)

				const answer = await answeredWith({
					run: runStandard({
						argv: ['index'],
						cwd: workspace.cwd,
						environment: workspace.environment,
					}),
					exitCode: 0,
				})

				expect(listedBy(answer.output)).toEqual(testCase.expected)
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
	}
})

describe('standard index and find: no file to index', () => {
	it(
		'a folder with no .md file next to one with → listed as having no indexable file, the other indexed, exit 0',
		async () => {
			const workspace = createStandardWorkspace({
				standards: { alpha: { 'one.md': SAMPLE }, beta: { 'notes.txt': SAMPLE } },
			})

			const answer = await answeredWith({
				run: runStandard({
					argv: ['index'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})

			expect(listedBy(answer.output)).toEqual({ standards: ['alpha'], fileIds: ['alpha/one'] })
			expect(
				trimmedLinesOf(answer.output).filter(
					(line) => line.includes('beta') && line.includes('no indexable file'),
				),
			).toHaveLength(1)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'no selected folder holding a .md file → index exits 1 saying so',
		async () => {
			const workspace = createStandardWorkspace({
				standards: { alpha: { 'notes.txt': SAMPLE }, beta: { 'nested/deep.md': SAMPLE } },
			})

			const answer = await answeredWith({
				run: runStandard({
					argv: ['index'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 1,
			})

			expect(answer.output).toContain('no indexable file')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'no selected folder holding a .md file → find exits 1 too',
		async () => {
			const workspace = createStandardWorkspace({
				standards: { alpha: { 'notes.txt': SAMPLE }, beta: {} },
			})

			await expect(
				runStandard({
					argv: ['find', SAMPLE_WORD],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
			).resolves.toMatchObject({ exitCode: 1 })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('--standard: one standard of the root, matched case-insensitively', () => {
	const standards = {
		alpha: { 'one.md': SAMPLE },
		beta: { 'one.md': SAMPLE },
	}

	it(
		'--standard BETA → only the beta folder is indexed',
		async () => {
			const workspace = createStandardWorkspace({ standards })

			const answer = await answeredWith({
				run: runStandard({
					argv: ['index', '--standard', 'BETA'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})

			expect(listedBy(answer.output)).toEqual({ standards: ['beta'], fileIds: ['beta/one'] })
			expect(entriesOf(join(workspace.cache, 'dialecte', 'standard'))).toEqual(['beta'])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	for (const argv of [
		['index', '--standard', 'gamma'],
		['find', SAMPLE_WORD, '--standard', 'gamma'],
	])
		it(
			`${argv.join(' ')} → exit 2 naming the known ids, no search of the whole root`,
			async () => {
				const workspace = createStandardWorkspace({ standards })

				const answer = await answeredWith({
					run: runStandard({ argv, cwd: workspace.cwd, environment: workspace.environment }),
					exitCode: 2,
				})

				expect(answer.output).toContain('alpha')
				expect(answer.output).toContain('beta')
				expect(answer.output).not.toContain('alpha/one')
				expect(entriesOf(workspace.cache)).toEqual([])
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
})

type WorkTreeCase = {
	/** Sets the tree up; returns the environment the command runs with. */
	prepare: (workspace: StandardWorkspace) => NodeJS.ProcessEnv
	exitCode: 0 | 2
	/** Folders that must hold nothing after the run (the cache the command may not write). */
	untouched: (workspace: StandardWorkspace) => string[]
}

/** A folder that is the top of a git work tree: it holds a `.git` entry. */
function workTreeAt(params: { folder: string; kind: 'folder' | 'file' }): void {
	mkdirSync(params.folder, { recursive: true })
	if (params.kind === 'folder') mkdirSync(join(params.folder, GIT_FOLDER))
	else writeFileSync(join(params.folder, GIT_FOLDER), 'gitdir: /nowhere\n')
}

describe('refusals inside a git work tree (the standard must not live in a repository)', () => {
	const testCases: Record<string, WorkTreeCase> = {
		'the root inside a work tree whose .git is a folder → exit 2': {
			prepare: (workspace) => {
				const repository = join(workspace.base, 'repository')
				workTreeAt({ folder: repository, kind: 'folder' })
				const root = join(repository, 'standards')
				writeStandards({ root, standards: { alpha: { 'one.md': SAMPLE } } })
				return withRoot({ workspace, root })
			},
			exitCode: 2,
			untouched: (workspace) => [workspace.cache],
		},
		'the root inside a work tree whose .git is a file → exit 2': {
			prepare: (workspace) => {
				const repository = join(workspace.base, 'repository')
				workTreeAt({ folder: repository, kind: 'file' })
				const root = join(repository, 'deep', 'standards')
				writeStandards({ root, standards: { alpha: { 'one.md': SAMPLE } } })
				return withRoot({ workspace, root })
			},
			exitCode: 2,
			untouched: (workspace) => [workspace.cache],
		},
		'the root itself holding a .git folder → exit 2': {
			prepare: (workspace) => {
				writeStandards({ root: workspace.root, standards: { alpha: { 'one.md': SAMPLE } } })
				mkdirSync(join(workspace.root, GIT_FOLDER))
				return withRoot({ workspace, root: workspace.root })
			},
			exitCode: 2,
			untouched: (workspace) => [workspace.cache],
		},
		'a standard folder that is a symlink into a work tree → exit 2': {
			prepare: (workspace) => {
				const repository = join(workspace.base, 'repository')
				workTreeAt({ folder: repository, kind: 'folder' })
				writeTextFile({ path: join(repository, 'alpha', 'one.md'), text: SAMPLE })
				mkdirSync(workspace.root, { recursive: true })
				symlinkSync(join(repository, 'alpha'), join(workspace.root, 'alpha'), 'dir')
				return withRoot({ workspace, root: workspace.root })
			},
			exitCode: 2,
			untouched: (workspace) => [workspace.cache],
		},
		'the cache folder inside a work tree → exit 2, nothing written there': {
			prepare: (workspace) => {
				const repository = join(workspace.base, 'repository')
				workTreeAt({ folder: repository, kind: 'folder' })
				writeStandards({ root: workspace.root, standards: { alpha: { 'one.md': SAMPLE } } })
				return {
					...withRoot({ workspace, root: workspace.root }),
					XDG_CACHE_HOME: join(repository, 'cache'),
				}
			},
			exitCode: 2,
			untouched: (workspace) => [join(workspace.base, 'repository', 'cache')],
		},
		'DIALECTE_STANDARD itself a symlink that resolves into a work tree → exit 2': {
			prepare: (workspace) => {
				const repository = join(workspace.base, 'repository')
				workTreeAt({ folder: repository, kind: 'folder' })
				const target = join(repository, 'standards')
				writeStandards({ root: target, standards: { alpha: { 'one.md': SAMPLE } } })
				const link = join(workspace.base, 'root-link')
				symlinkSync(target, link, 'dir')
				return withRoot({ workspace, root: link })
			},
			exitCode: 2,
			untouched: (workspace) => [workspace.cache],
		},
		'a work tree beside the root, not above it → not refused': {
			prepare: (workspace) => {
				workTreeAt({ folder: join(workspace.base, 'other'), kind: 'folder' })
				writeStandards({ root: workspace.root, standards: { alpha: { 'one.md': SAMPLE } } })
				return withRoot({ workspace, root: workspace.root })
			},
			exitCode: 0,
			untouched: () => [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(
			title,
			async () => {
				const workspace = createStandardWorkspace()
				const environment = testCase.prepare(workspace)

				const answer = await answeredWith({
					run: runStandard({ argv: ['index'], cwd: workspace.cwd, environment }),
					exitCode: testCase.exitCode,
				})

				if (testCase.exitCode === 2) expect(answer.output).toContain(WORK_TREE_MARKER)
				for (const folder of testCase.untouched(workspace))
					expect(existsSync(folder) ? entriesOf(folder) : []).toEqual([])
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
	}
})
