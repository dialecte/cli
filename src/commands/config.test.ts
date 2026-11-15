/** `dialecte config list|get|set|check` through `runConfig`, on scratch repositories and temporary config folders. */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { HOST_PLATFORM, WORKSPACE_REPO_KEY } from '../../test/config-workspace.constants.ts'
import { createConfigWorkspace } from '../../test/config-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { GIT_KEY_NOTE } from '../lib/config/find-old-homes.constants.ts'
import { personalConfigFileOf } from '../lib/config/personal-config-file-of.ts'
import { comparablePathOf } from '../lib/config/repo-key-of.ts'
import { CONFIG_USAGE } from './config.constants.ts'
import { runConfig } from './config.ts'

import { describe, expect, it } from 'vitest'

import type { ConfigWorkspace } from '../../test/config-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { RunConfigParams } from './config.types.ts'

const PROJECT_HEADER = '# Dialecte project settings - shared, committed\nschema: 1\n'
const PERSONAL_HEADER = '# Dialecte personal settings - this machine, never committed\nschema: 1\n'

/** `.dialecterc`: baseBranch on line 3, gate on line 4. */
const PROJECT = '# project\nschema: 1\nbaseBranch: main\ngate:\n  fast: [check]\n'

/** config.yml: editor on line 3, load on line 4, the repository's entry on line 7 (its editor on line 8). */
const PERSONAL =
	'# personal\nschema: 1\neditor: code\nload:\n  budget: 10\nrepos:\n  github.com/example/repo:\n    editor: zed\n'

const ANY_TEXT = expect.stringMatching(/\S/)

/** What `runConfig` is called with on `workspace`: on the host platform unless the case says another machine. */
function callOf(params: {
	workspace: ConfigWorkspace
	argv: string[]
	environment?: Readonly<Record<string, string | undefined>>
	platform?: NodeJS.Platform
	/** The folder the command runs from (the repository root by default). */
	cwd?: string
}): RunConfigParams {
	const { workspace } = params
	return {
		cwd: params.cwd ?? workspace.root,
		argv: params.argv,
		environment: params.environment ?? workspace.environment,
		platform: params.platform ?? HOST_PLATFORM,
		home: workspace.home,
	}
}

/** The exit code and the printed lines of an answer. */
function answerOf(result: CommandResult): { exitCode: number; lines: string[] } {
	return { exitCode: result.exitCode, lines: result.output.split('\n') }
}

/** The exit code and the JSON an answer printed. */
function jsonAnswerOf(result: CommandResult): { exitCode: number; json: unknown } {
	return { exitCode: result.exitCode, json: JSON.parse(result.output) }
}

/** The text of a file; null when it is absent. */
function textOrAbsent(file: string): string | null {
	return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** The lines of a file before its `  fast:` line and from its `  full:` line on. */
function aroundGateFast(file: string): { head: string[]; tail: string[] } {
	const lines = readFileSync(file, 'utf8').split('\n')
	return {
		head: lines.slice(
			0,
			lines.findIndex((line) => line.startsWith('  fast:')),
		),
		tail: lines.slice(lines.findIndex((line) => line.startsWith('  full:'))),
	}
}

/** The text of both config files (null for an absent one). */
function filesOf(workspace: ConfigWorkspace): { project: string | null; personal: string | null } {
	return {
		project: textOrAbsent(workspace.projectFile),
		personal: textOrAbsent(workspace.personalFile),
	}
}

/** A wrong-layer key, a package.json setting, an unmigrated git key and a migrated one at once. */
const MIXED: Parameters<typeof createConfigWorkspace>[0] = {
	project: 'schema: 1\nbaseBranch: main\neditor: zed\n',
	personal: 'schema: 1\neditor: zed\n',
	packageJson: '{\n  "name": "x",\n  "dialecte": {\n    "gate": {}\n  }\n}\n',
	gitConfig: { 'dialecte.editor': 'zed', 'dialecte.consumerNames': 'acme' },
}

/** A pattern matching one line that starts with `prefix` and carries a non-blank problem after it. */
function lineWithProblem(prefix: string): RegExp {
	return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\S`)
}

describe('config list', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('no file anywhere → one line naming both files, exit 0', () => {
		const workspace = createConfigWorkspace()

		expect(answerOf(runConfig(callOf({ workspace, argv: ['list'] })))).toEqual({
			exitCode: 0,
			lines: [`no settings (project ${workspace.projectFile}, personal ${workspace.personalFile})`],
		})
	})

	it('files present with no value and no finding → the same no settings line, exit 0 (D20)', () => {
		const workspace = createConfigWorkspace({ project: 'schema: 1\n' })

		expect(answerOf(runConfig(callOf({ workspace, argv: ['list'] })))).toEqual({
			exitCode: 0,
			lines: [`no settings (project ${workspace.projectFile}, personal ${workspace.personalFile})`],
		})
	})

	it('both files → one line per value in registry order, the source file:line, the repos entry beating the top level', () => {
		const workspace = createConfigWorkspace({ project: PROJECT, personal: PERSONAL })
		const { projectFile, personalFile } = workspace

		expect(answerOf(runConfig(callOf({ workspace, argv: ['list'] })))).toEqual({
			exitCode: 0,
			lines: [
				`baseBranch  "main"  ${projectFile}:3`,
				`gate  {"fast":["check"]}  ${projectFile}:4`,
				`editor  "zed"  ${personalFile}:8 (repos ${WORKSPACE_REPO_KEY})`,
				`load  {"budget":10}  ${personalFile}:4`,
			],
		})
	})

	it('the personal file under the home folder of macOS, no XDG variable → read from there', () => {
		const workspace = createConfigWorkspace()
		const folder = join(workspace.home, '.config', 'dialecte')
		mkdirSync(folder, { recursive: true })
		writeFileSync(join(folder, 'config.yml'), 'schema: 1\neditor: code\n')

		expect(
			answerOf(
				runConfig(callOf({ workspace, argv: ['list'], environment: {}, platform: 'darwin' })),
			),
		).toEqual({
			exitCode: 0,
			lines: [
				`editor  "code"  ${personalConfigFileOf({ environment: {}, platform: 'darwin', home: workspace.home })}:2`,
			],
		})
	})

	it('a personal key in .dialecterc → the valid values, then the finding as a "!" line, exit 0', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\nbaseBranch: main\neditor: zed\n',
		})

		expect(answerOf(runConfig(callOf({ workspace, argv: ['list'] })))).toEqual({
			exitCode: 0,
			lines: [
				`baseBranch  "main"  ${workspace.projectFile}:2`,
				expect.stringMatching(lineWithProblem(`! ${workspace.projectFile}:3: editor: `)),
			],
		})
	})

	it('a package.json "dialecte" setting → its refusal as a "!" line, exit 0', () => {
		const workspace = createConfigWorkspace({
			packageJson: '{\n  "name": "x",\n  "dialecte": {\n    "gate": {}\n  }\n}\n',
		})

		expect(answerOf(runConfig(callOf({ workspace, argv: ['list'] })))).toEqual({
			exitCode: 0,
			lines: [
				expect.stringMatching(lineWithProblem(`! ${workspace.packageJsonFile}:4: dialecte.gate: `)),
			],
		})
	})

	it('a git key config.yml already holds → its note as a "!" line after the values', () => {
		const workspace = createConfigWorkspace({
			personal: 'schema: 1\neditor: zed\n',
			gitConfig: { 'dialecte.editor': 'zed' },
		})

		expect(answerOf(runConfig(callOf({ workspace, argv: ['list'] })))).toEqual({
			exitCode: 0,
			lines: [
				`editor  "zed"  ${workspace.personalFile}:2`,
				`! ${GIT_KEY_NOTE.replaceAll('{gitKey}', 'dialecte.editor')}`,
			],
		})
	})

	it('every kind of line in one run: findings, project old homes, personal old homes, then notes (S1)', () => {
		const workspace = createConfigWorkspace(MIXED)
		const { projectFile, packageJsonFile, personalFile } = workspace

		expect(answerOf(runConfig(callOf({ workspace, argv: ['list'] })))).toEqual({
			exitCode: 0,
			lines: [
				`baseBranch  "main"  ${projectFile}:2`,
				`editor  "zed"  ${personalFile}:2`,
				expect.stringMatching(lineWithProblem(`! ${projectFile}:3: editor: `)),
				expect.stringMatching(lineWithProblem(`! ${packageJsonFile}:4: dialecte.gate: `)),
				expect.stringMatching(lineWithProblem('! git config:0: dialecte.consumerNames: ')),
				`! ${GIT_KEY_NOTE.replaceAll('{gitKey}', 'dialecte.editor')}`,
			],
		})
	})

	it('--json with both files → the object with each source as its structured object (D19)', () => {
		const workspace = createConfigWorkspace({ project: PROJECT, personal: PERSONAL })
		const { projectFile, personalFile } = workspace

		expect(jsonAnswerOf(runConfig(callOf({ workspace, argv: ['list', '--json'] })))).toEqual({
			exitCode: 0,
			json: {
				schema: 1,
				projectFile,
				personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [
					{
						key: 'baseBranch',
						value: 'main',
						source: { kind: 'project', file: projectFile, line: 3 },
					},
					{
						key: 'gate',
						value: { fast: ['check'] },
						source: { kind: 'project', file: projectFile, line: 4 },
					},
					{
						key: 'editor',
						value: 'zed',
						source: {
							kind: 'repo',
							file: personalFile,
							line: 8,
							repo: WORKSPACE_REPO_KEY,
						},
					},
					{
						key: 'load',
						value: { budget: 10 },
						source: { kind: 'personal', file: personalFile, line: 4 },
					},
				],
				findings: [],
				notes: [],
			},
		})
	})

	it('--json with no file anywhere → values empty', () => {
		const workspace = createConfigWorkspace()

		expect(jsonAnswerOf(runConfig(callOf({ workspace, argv: ['list', '--json'] })))).toEqual({
			exitCode: 0,
			json: {
				schema: 1,
				projectFile: workspace.projectFile,
				personalFile: workspace.personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [],
				findings: [],
				notes: [],
			},
		})
	})

	it('--json without a remote → the repository key is its real path', () => {
		const workspace = createConfigWorkspace({ origin: null })

		expect(jsonAnswerOf(runConfig(callOf({ workspace, argv: ['list', '--json'] })))).toEqual({
			exitCode: 0,
			json: expect.objectContaining({
				repo: {
					key: comparablePathOf({ path: realpathSync(workspace.root), platform: HOST_PLATFORM }),
					from: 'path',
				},
			}),
		})
	})

	it('--json with a refused key and a note → the finding with refused true, the note text', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\neditor: zed\n',
			personal: 'schema: 1\neditor: zed\n',
			gitConfig: { 'dialecte.editor': 'zed' },
		})

		expect(jsonAnswerOf(runConfig(callOf({ workspace, argv: ['list', '--json'] })))).toEqual({
			exitCode: 0,
			json: expect.objectContaining({
				values: [
					{
						key: 'editor',
						value: 'zed',
						source: { kind: 'personal', file: workspace.personalFile, line: 2 },
					},
				],
				findings: [
					{ file: workspace.projectFile, line: 2, key: 'editor', problem: ANY_TEXT, refused: true },
				],
				notes: [GIT_KEY_NOTE.replaceAll('{gitKey}', 'dialecte.editor')],
			}),
		})
	})
})

describe('config get', { timeout: STORE_CASE_TIMEOUT }, () => {
	const CASES: {
		name: string
		argv: string[]
		exitCode: number
		line: (workspace: ConfigWorkspace) => string
	}[] = [
		{
			name: 'a top-level key → its value and source',
			argv: ['get', 'baseBranch'],
			exitCode: 0,
			line: (workspace) => `baseBranch  "main"  ${workspace.projectFile}:3`,
		},
		{
			name: 'a key path into a list → that value, the top-level key source',
			argv: ['get', 'gate.fast'],
			exitCode: 0,
			line: (workspace) => `gate.fast  ["check"]  ${workspace.projectFile}:4`,
		},
		{
			name: 'a key path into a personal mapping',
			argv: ['get', 'load.budget'],
			exitCode: 0,
			line: (workspace) => `load.budget  10  ${workspace.personalFile}:4`,
		},
		{
			name: 'a key the repos entry sets → the repos source',
			argv: ['get', 'editor'],
			exitCode: 0,
			line: (workspace) =>
				`editor  "zed"  ${workspace.personalFile}:8 (repos ${WORKSPACE_REPO_KEY})`,
		},
		{
			name: 'a key path whose parent is set but not the leaf → not set, exit 1',
			argv: ['get', 'gate.full'],
			exitCode: 1,
			line: () => 'gate.full: not set',
		},
		{
			name: 'a registry key with no value → not set, exit 1',
			argv: ['get', 'profile'],
			exitCode: 1,
			line: () => 'profile: not set',
		},
		{
			name: 'an unknown key → exit 2 naming it',
			argv: ['get', 'nope'],
			exitCode: 2,
			line: () => "config: unknown key 'nope'",
		},
		{
			name: 'an unknown key path → exit 2 naming it as given',
			argv: ['get', 'nope.deeper'],
			exitCode: 2,
			line: () => "config: unknown key 'nope.deeper'",
		},
	]

	it.each(CASES)('$name', ({ argv, exitCode, line }) => {
		const workspace = createConfigWorkspace({ project: PROJECT, personal: PERSONAL })

		expect(answerOf(runConfig(callOf({ workspace, argv })))).toEqual({
			exitCode,
			lines: [line(workspace)],
		})
	})

	it('a key whose personal value is refused → not set, then the finding as a "!" line, exit 1 (D21)', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 1\neditor: 3\n' })

		expect(answerOf(runConfig(callOf({ workspace, argv: ['get', 'editor'] })))).toEqual({
			exitCode: 1,
			lines: [
				'editor: not set',
				expect.stringMatching(lineWithProblem(`! ${workspace.personalFile}:2: editor: `)),
			],
		})
	})

	it('a key of a config.yml with schema 2 → not set, then the schema line', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 2\neditor: zed\n' })

		expect(answerOf(runConfig(callOf({ workspace, argv: ['get', 'editor'] })))).toEqual({
			exitCode: 1,
			lines: [
				'editor: not set',
				expect.stringMatching(lineWithProblem(`! ${workspace.personalFile}:1: schema: `)),
			],
		})
	})

	it('--json of a key of a config.yml with schema 2 → the schema finding too', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 2\neditor: zed\n' })

		expect(
			jsonAnswerOf(runConfig(callOf({ workspace, argv: ['get', 'editor', '--json'] }))),
		).toEqual({
			exitCode: 1,
			json: {
				schema: 1,
				key: 'editor',
				value: null,
				source: null,
				findings: [
					{
						file: workspace.personalFile,
						line: 1,
						key: 'schema',
						problem: ANY_TEXT,
						refused: true,
					},
				],
			},
		})
	})

	it('a personal key whose git key is unmigrated → not set, then its refusal line', () => {
		const workspace = createConfigWorkspace({ gitConfig: { 'dialecte.editor': 'zed' } })

		expect(answerOf(runConfig(callOf({ workspace, argv: ['get', 'editor'] })))).toEqual({
			exitCode: 1,
			lines: [
				'editor: not set',
				expect.stringMatching(lineWithProblem('! git config:0: dialecte.editor: ')),
			],
		})
	})

	it('forbiddenWords with an unmigrated forbidden-words file → not set, then its refusal line', () => {
		const workspace = createConfigWorkspace({ forbiddenWords: 'alpha\n' })

		expect(answerOf(runConfig(callOf({ workspace, argv: ['get', 'forbiddenWords'] })))).toEqual({
			exitCode: 1,
			lines: [
				'forbiddenWords: not set',
				expect.stringMatching(
					lineWithProblem(`! ${workspace.forbiddenWordsFile}:1: forbidden-words: `),
				),
			],
		})
	})

	it('--json of a key not set → exit 1, value and source null, no finding (D24)', () => {
		const workspace = createConfigWorkspace()

		expect(
			jsonAnswerOf(runConfig(callOf({ workspace, argv: ['get', 'editor', '--json'] }))),
		).toEqual({
			exitCode: 1,
			json: { schema: 1, key: 'editor', value: null, source: null, findings: [] },
		})
	})

	it('--json of a key whose value is refused → the same, with its finding (D24)', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 1\neditor: 3\n' })

		expect(
			jsonAnswerOf(runConfig(callOf({ workspace, argv: ['get', 'editor', '--json'] }))),
		).toEqual({
			exitCode: 1,
			json: {
				schema: 1,
				key: 'editor',
				value: null,
				source: null,
				findings: [
					{
						file: workspace.personalFile,
						line: 2,
						key: 'editor',
						problem: ANY_TEXT,
						refused: true,
					},
				],
			},
		})
	})

	it('--json → the key as given, the value and the source', () => {
		const workspace = createConfigWorkspace({ project: PROJECT, personal: PERSONAL })

		expect(
			jsonAnswerOf(runConfig(callOf({ workspace, argv: ['get', 'gate.fast', '--json'] }))),
		).toEqual({
			exitCode: 0,
			json: {
				schema: 1,
				key: 'gate.fast',
				value: ['check'],
				source: { kind: 'project', file: workspace.projectFile, line: 4 },
			},
		})
	})
})

describe('config set, written', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--project on no file → header, schema, the value; one line naming the committed file', () => {
		const workspace = createConfigWorkspace()

		expect({
			answer: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'baseBranch', 'develop', '--project'] })),
			),
			file: textOrAbsent(workspace.projectFile),
			untouched: textOrAbsent(workspace.personalFile),
		}).toEqual({
			answer: {
				exitCode: 0,
				lines: [
					`config set: baseBranch written to ${workspace.projectFile}: a committed file, the cli never commits it`,
				],
			},
			file: `${PROJECT_HEADER}baseBranch: develop\n`,
			untouched: null,
		})
	})

	it('--project keeps every other line byte for byte and the key order of the file', () => {
		const before = [
			'# Dialecte project settings - shared, committed',
			'',
			'tdd: { runner: vitest }',
			'schema: 1',
			'# the base',
			'baseBranch: main',
			'',
			'gate:',
			'  # the fast steps',
			'  fast: [check, test]',
			'  full: [check, build] # the full ones',
			'',
			'# the end',
			'',
		]
		const workspace = createConfigWorkspace({ project: before.join('\n') })

		expect(textOrAbsent(workspace.personalFile)).toBeNull()
		expect({
			exitCode: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'gate.fast', '[check]', '--project'] })),
			).exitCode,
			...aroundGateFast(workspace.projectFile),
		}).toEqual({
			exitCode: 0,
			head: before.slice(0, 9),
			tail: before.slice(10),
		})
		expect(answerOf(runConfig(callOf({ workspace, argv: ['get', 'gate.fast'] }))).lines).toEqual([
			`gate.fast  ["check"]  ${workspace.projectFile}:8`,
		])
	})

	it('--personal on no file and no folder → created with the personal header', () => {
		const workspace = createConfigWorkspace()

		expect({
			answer: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'load.budget', '10', '--personal'] })),
			),
			file: textOrAbsent(workspace.personalFile),
			untouched: textOrAbsent(workspace.projectFile),
		}).toEqual({
			answer: {
				exitCode: 0,
				lines: [`config set: load.budget written to ${workspace.personalFile}`],
			},
			file: `${PERSONAL_HEADER}load:\n  budget: 10\n`,
			untouched: null,
		})
	})

	it('--repo writes under repos, keyed by the normalized remote', () => {
		const workspace = createConfigWorkspace()

		expect({
			answer: answerOf(runConfig(callOf({ workspace, argv: ['set', 'editor', 'zed', '--repo'] }))),
			file: textOrAbsent(workspace.personalFile),
			untouched: textOrAbsent(workspace.projectFile),
		}).toEqual({
			answer: {
				exitCode: 0,
				lines: [
					`config set: editor written to ${workspace.personalFile} (repos ${WORKSPACE_REPO_KEY})`,
				],
			},
			file: `${PERSONAL_HEADER}repos:\n  ${WORKSPACE_REPO_KEY}:\n    editor: zed\n`,
			untouched: null,
		})
	})

	it('--repo on a repository without a remote → keyed by its real path', () => {
		const workspace = createConfigWorkspace({ origin: null })
		const repo = comparablePathOf({ path: realpathSync(workspace.root), platform: HOST_PLATFORM })

		expect({
			answer: answerOf(runConfig(callOf({ workspace, argv: ['set', 'editor', 'zed', '--repo'] }))),
			file: textOrAbsent(workspace.personalFile),
			untouched: textOrAbsent(workspace.projectFile),
		}).toEqual({
			answer: {
				exitCode: 0,
				lines: [`config set: editor written to ${workspace.personalFile} (repos ${repo})`],
			},
			file: `${PERSONAL_HEADER}repos:\n  ${repo}:\n    editor: zed\n`,
			untouched: null,
		})
	})

	it('--repo on an entry spelled as the https remote → that entry changed, no second entry', () => {
		const workspace = createConfigWorkspace({
			personal: 'schema: 1\nrepos:\n  https://github.com/example/repo.git:\n    editor: code\n',
		})

		expect({
			exitCode: answerOf(runConfig(callOf({ workspace, argv: ['set', 'editor', 'zed', '--repo'] })))
				.exitCode,
			file: textOrAbsent(workspace.personalFile),
			untouched: textOrAbsent(workspace.projectFile),
		}).toEqual({
			exitCode: 0,
			file: 'schema: 1\nrepos:\n  https://github.com/example/repo.git:\n    editor: zed\n',
			untouched: null,
		})
	})

	it('a CRLF file stays CRLF, every untouched line byte-identical (D23)', () => {
		const workspace = createConfigWorkspace({
			personal: 'schema: 1\r\n# my editor\r\neditor: code\r\n\r\nload:\r\n  budget: 2\r\n',
		})

		expect({
			exitCode: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'editor', 'zed', '--personal'] })),
			).exitCode,
			file: textOrAbsent(workspace.personalFile),
		}).toEqual({
			exitCode: 0,
			file: 'schema: 1\r\n# my editor\r\neditor: zed\r\n\r\nload:\r\n  budget: 2\r\n',
		})
	})

	it('a value holding a forbidden word only inside a longer word is written (N4)', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 1\nforbiddenWords: [zorb]\n' })

		expect({
			answer: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'editor', 'zorbing', '--personal'] })),
			),
			file: textOrAbsent(workspace.personalFile),
		}).toEqual({
			answer: { exitCode: 0, lines: [`config set: editor written to ${workspace.personalFile}`] },
			file: 'schema: 1\nforbiddenWords: [zorb]\neditor: zorbing\n',
		})
	})

	it('a refusal on the key being set is overwritten by the set (D22)', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 1\neditor: 3\n' })

		expect({
			answer: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'editor', 'zed', '--personal'] })),
			),
			file: textOrAbsent(workspace.personalFile),
		}).toEqual({
			answer: { exitCode: 0, lines: [`config set: editor written to ${workspace.personalFile}`] },
			file: 'schema: 1\neditor: zed\n',
		})
	})

	it('a refusal on another key never blocks a set: that key stays as it is', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 1\neditor: 3\n' })

		expect({
			answer: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'load.budget', '2', '--personal'] })),
			),
			file: textOrAbsent(workspace.personalFile),
		}).toEqual({
			answer: {
				exitCode: 0,
				lines: [`config set: load.budget written to ${workspace.personalFile}`],
			},
			file: 'schema: 1\neditor: 3\nload:\n  budget: 2\n',
		})
	})

	it('a refusal in the other file never blocks a set of this one (D22)', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 1\neditor: 3\n' })

		expect({
			exitCode: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'baseBranch', 'main', '--project'] })),
			).exitCode,
			project: textOrAbsent(workspace.projectFile),
			personal: textOrAbsent(workspace.personalFile),
		}).toEqual({
			exitCode: 0,
			project: `${PROJECT_HEADER}baseBranch: main\n`,
			personal: 'schema: 1\neditor: 3\n',
		})
	})

	it('--repo with a local-path origin on darwin → get reads the entry back from its repos source', () => {
		const workspace = createConfigWorkspace({ origin: '/Srv/Git/Repo.git' })
		const platform = 'darwin'

		expect({
			set: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'editor', 'zed', '--repo'], platform })),
			).exitCode,
			get: jsonAnswerOf(
				runConfig(callOf({ workspace, argv: ['get', 'editor', '--json'], platform })),
			),
		}).toEqual({
			set: 0,
			get: {
				exitCode: 0,
				json: expect.objectContaining({
					value: 'zed',
					source: expect.objectContaining({
						kind: 'repo',
						file: personalConfigFileOf({
							environment: workspace.environment,
							platform,
							home: workspace.home,
						}),
					}),
				}),
			},
		})
	})

	it('run from a subfolder → get reads the .dialecterc of the root', () => {
		const workspace = createConfigWorkspace({ project: PROJECT })
		const cwd = join(workspace.root, 'src', 'deep')
		mkdirSync(cwd, { recursive: true })

		expect(answerOf(runConfig(callOf({ workspace, argv: ['get', 'baseBranch'], cwd })))).toEqual({
			exitCode: 0,
			lines: [`baseBranch  "main"  ${workspace.projectFile}:3`],
		})
	})

	it('set --project from a subfolder → the root file is written, none in the subfolder', () => {
		const workspace = createConfigWorkspace({ project: PROJECT })
		const cwd = join(workspace.root, 'src', 'deep')
		mkdirSync(cwd, { recursive: true })

		expect({
			exitCode: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'baseBranch', 'develop', '--project'], cwd })),
			).exitCode,
			root: textOrAbsent(workspace.projectFile),
			subfolder: textOrAbsent(join(cwd, '.dialecterc')),
		}).toEqual({
			exitCode: 0,
			root: PROJECT.replace('baseBranch: main', 'baseBranch: develop'),
			subfolder: null,
		})
	})

	it('a value text that holds an unquoted " #" → exit 2, nothing written, the line tells to quote', () => {
		const workspace = createConfigWorkspace()
		const before = filesOf(workspace)

		expect({
			answer: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'editor', 'code #wait', '--personal'] })),
			),
			files: filesOf(workspace),
		}).toEqual({
			answer: { exitCode: 2, lines: [expect.stringMatching(/quote/)] },
			files: before,
		})
	})

	it('the same text quoted → written as that text', () => {
		const workspace = createConfigWorkspace()

		expect({
			exitCode: answerOf(
				runConfig(callOf({ workspace, argv: ['set', 'editor', '"code #wait"', '--personal'] })),
			).exitCode,
			value: jsonAnswerOf(runConfig(callOf({ workspace, argv: ['get', 'editor', '--json'] }))).json,
		}).toEqual({
			exitCode: 0,
			value: expect.objectContaining({ value: 'code #wait' }),
		})
	})

	const VALUES: { name: string; key: string; text: string; value: unknown }[] = [
		{ name: 'a number', key: 'load.budget', text: '10', value: 10 },
		{ name: 'a word', key: 'editor', text: 'zed', value: 'zed' },
		{ name: 'a flow list', key: 'personProcesses', text: '[zsh, node]', value: ['zsh', 'node'] },
	]

	it.each(VALUES)('the value text is read as YAML: $name', ({ key, text, value }) => {
		const workspace = createConfigWorkspace()

		expect({
			exitCode: answerOf(runConfig(callOf({ workspace, argv: ['set', key, text, '--personal'] })))
				.exitCode,
			value: jsonAnswerOf(runConfig(callOf({ workspace, argv: ['get', key, '--json'] }))).json,
		}).toEqual({
			exitCode: 0,
			value: expect.objectContaining({ key, value }),
		})
	})
})

describe('config set, refused', { timeout: STORE_CASE_TIMEOUT }, () => {
	const CASES: {
		name: string
		argv: string[]
		line: string
		/** The files the workspace starts with: both stay as they are. */
		files: Parameters<typeof createConfigWorkspace>[0]
	}[] = [
		{
			name: 'a personal key with --project',
			argv: ['set', 'editor', 'zed', '--project'],
			line: 'config set: editor is a personal key and cannot be set with --project',
			files: {},
		},
		{
			name: 'a project key with --personal',
			argv: ['set', 'baseBranch', 'dev', '--personal'],
			line: 'config set: baseBranch is a project key and cannot be set with --personal',
			files: { personal: 'schema: 1\neditor: code\n' },
		},
		{
			name: 'a key a repos entry cannot hold, with --repo',
			argv: ['set', 'corpora', '{x: {xsd: a.xsd}}', '--repo'],
			line: 'config set: corpora cannot be set per repository (--repo)',
			files: {},
		},
		{
			name: 'a value failing the key check',
			argv: ['set', 'load.budget', '0', '--personal'],
			line: 'config set: load.budget: budget must be a whole number of 1 or more',
			files: {},
		},
		{
			name: 'a key path adding an unknown field',
			argv: ['set', 'load.speed', '3', '--personal'],
			line: "config set: load.speed: has an unknown field 'speed' (allowed: budget)",
			files: { personal: 'schema: 1\nload:\n  budget: 2\n' },
		},
		{
			name: 'a value of the wrong type',
			argv: ['set', 'editor', '[a, b]', '--personal'],
			line: 'config set: editor: must be a text',
			files: {},
		},
		{
			name: 'a project key with --repo (D24)',
			argv: ['set', 'baseBranch', 'x', '--repo'],
			line: 'config set: baseBranch is a project key and cannot be set with --repo',
			files: {},
		},
		{
			name: 'an unknown key',
			argv: ['set', 'nope', '1', '--project'],
			line: "config: unknown key 'nope'",
			files: {},
		},
	]

	it.each(CASES)('$name → exit 2, nothing written', ({ argv, line, files }) => {
		const workspace = createConfigWorkspace(files)
		const before = filesOf(workspace)

		expect({
			answer: answerOf(runConfig(callOf({ workspace, argv }))),
			files: filesOf(workspace),
		}).toEqual({
			answer: { exitCode: 2, lines: [line] },
			files: before,
		})
	})

	const UNUSABLE: {
		name: string
		argv: string[]
		files: Parameters<typeof createConfigWorkspace>[0]
	}[] = [
		{
			name: 'a personal file with schema 2',
			argv: ['set', 'editor', 'zed', '--personal'],
			files: { personal: 'schema: 2\neditor: code\n' },
		},
		{
			name: 'a personal file that is not YAML',
			argv: ['set', 'editor', 'zed', '--personal'],
			files: { personal: 'schema: 1\neditor: [unclosed\n' },
		},
		{
			name: 'a personal file without a schema line',
			argv: ['set', 'editor', 'zed', '--personal'],
			files: { personal: 'editor: code\n' },
		},
		{
			name: 'a project file with schema 2',
			argv: ['set', 'baseBranch', 'main', '--project'],
			files: { project: 'schema: 2\nbaseBranch: dev\n' },
		},
	]

	it.each(UNUSABLE)('$name → exit 2, bytes unchanged (D22)', ({ argv, files }) => {
		const workspace = createConfigWorkspace(files)
		const before = filesOf(workspace)

		expect({
			answer: answerOf(runConfig(callOf({ workspace, argv }))),
			files: filesOf(workspace),
		}).toEqual({
			answer: { exitCode: 2, lines: [ANY_TEXT] },
			files: before,
		})
	})

	const FORBIDDEN_LIST = 'schema: 1\nforbiddenWords: [zorb]\n'

	it('forbiddenWords naming an already forbidden word is written, exit 0 (D18)', () => {
		const workspace = createConfigWorkspace({ personal: FORBIDDEN_LIST })

		expect({
			answer: answerOf(
				runConfig(
					callOf({ workspace, argv: ['set', 'forbiddenWords', '[ok, zorb]', '--personal'] }),
				),
			),
			value: jsonAnswerOf(
				runConfig(callOf({ workspace, argv: ['get', 'forbiddenWords', '--json'] })),
			).json,
		}).toEqual({
			answer: {
				exitCode: 0,
				lines: [`config set: forbiddenWords written to ${workspace.personalFile}`],
			},
			value: expect.objectContaining({ value: ['ok', 'zorb'] }),
		})
	})

	const FORBIDDEN: {
		name: string
		argv: string[]
	}[] = [
		{
			name: 'a personal text holding a forbidden word',
			argv: ['set', 'editor', 'open zorb now', '--personal'],
		},
		{
			name: 'a list holding a forbidden word, whatever its case',
			argv: ['set', 'personProcesses', '[ok, ZORB]', '--personal'],
		},
		{
			name: 'a project value holding a forbidden word',
			argv: ['set', 'baseBranch', 'zorb', '--project'],
		},
	]

	it.each(FORBIDDEN)('$name → exit 2, nothing written, the word never printed', ({ argv }) => {
		const workspace = createConfigWorkspace({ personal: FORBIDDEN_LIST })
		const before = filesOf(workspace)

		expect({
			answer: answerOf(runConfig(callOf({ workspace, argv }))),
			files: filesOf(workspace),
		}).toEqual({
			answer: {
				exitCode: 2,
				lines: ['config set: the value holds a word of your forbiddenWords list; nothing written'],
			},
			files: before,
		})
	})
})

describe('config check', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('no finding → one ok line naming both files, exit 0', () => {
		const workspace = createConfigWorkspace({ project: PROJECT, personal: PERSONAL })

		expect(answerOf(runConfig(callOf({ workspace, argv: ['check'] })))).toEqual({
			exitCode: 0,
			lines: [`config check: ok (${workspace.projectFile}, ${workspace.personalFile})`],
		})
	})

	it('no file anywhere → ok too', () => {
		const workspace = createConfigWorkspace()

		expect(answerOf(runConfig(callOf({ workspace, argv: ['check'] })))).toEqual({
			exitCode: 0,
			lines: [`config check: ok (${workspace.projectFile}, ${workspace.personalFile})`],
		})
	})

	const FINDINGS: {
		name: string
		workspace: Parameters<typeof createConfigWorkspace>[0]
		file: (workspace: ConfigWorkspace) => string
		line: number
		key: string
	}[] = [
		{
			name: 'a personal key in .dialecterc',
			workspace: { project: 'schema: 1\nbaseBranch: main\neditor: zed\n' },
			file: (workspace) => workspace.projectFile,
			line: 3,
			key: 'editor',
		},
		{
			name: 'an unknown key',
			workspace: { project: 'schema: 1\nzzz: 1\n' },
			file: (workspace) => workspace.projectFile,
			line: 2,
			key: 'zzz',
		},
		{
			name: 'a project key in config.yml',
			workspace: { personal: 'schema: 1\nbaseBranch: main\n' },
			file: (workspace) => workspace.personalFile,
			line: 2,
			key: 'baseBranch',
		},
		{
			name: 'a package.json "dialecte" setting',
			workspace: { packageJson: '{\n  "name": "x",\n  "dialecte": {\n    "gate": {}\n  }\n}\n' },
			file: (workspace) => workspace.packageJsonFile,
			line: 4,
			key: 'dialecte.gate',
		},
		{
			name: 'a dialecte.json',
			workspace: { dialecteJson: '{}\n' },
			file: (workspace) => workspace.dialecteJsonFile,
			line: 1,
			key: 'dialecte.json',
		},
		{
			name: 'an unmigrated git key',
			workspace: { gitConfig: { 'dialecte.editor': 'zed' } },
			file: () => 'git config',
			line: 0,
			key: 'dialecte.editor',
		},
	]

	it.each(FINDINGS)(
		'$name → one ✗ line file:line: key: problem, exit 1',
		({ workspace: params, file, line, key }) => {
			const workspace = createConfigWorkspace(params)

			expect(answerOf(runConfig(callOf({ workspace, argv: ['check'] })))).toEqual({
				exitCode: 1,
				lines: [expect.stringMatching(lineWithProblem(`✗ ${file(workspace)}:${line}: ${key}: `))],
			})
		},
	)

	it('a git key config.yml already holds → ok, then its note, exit 0', () => {
		const workspace = createConfigWorkspace({
			personal: 'schema: 1\neditor: zed\n',
			gitConfig: { 'dialecte.editor': 'zed' },
		})

		expect(answerOf(runConfig(callOf({ workspace, argv: ['check'] })))).toEqual({
			exitCode: 0,
			lines: [
				`config check: ok (${workspace.projectFile}, ${workspace.personalFile})`,
				`! ${GIT_KEY_NOTE.replaceAll('{gitKey}', 'dialecte.editor')}`,
			],
		})
	})

	it('every kind of finding in one run: each ✗ line in order, then the notes, exit 1 (S1)', () => {
		const workspace = createConfigWorkspace(MIXED)
		const { projectFile, packageJsonFile } = workspace

		expect(answerOf(runConfig(callOf({ workspace, argv: ['check'] })))).toEqual({
			exitCode: 1,
			lines: [
				expect.stringMatching(lineWithProblem(`✗ ${projectFile}:3: editor: `)),
				expect.stringMatching(lineWithProblem(`✗ ${packageJsonFile}:4: dialecte.gate: `)),
				expect.stringMatching(lineWithProblem('✗ git config:0: dialecte.consumerNames: ')),
				`! ${GIT_KEY_NOTE.replaceAll('{gitKey}', 'dialecte.editor')}`,
			],
		})
	})

	it('--json with no finding → ok true', () => {
		const workspace = createConfigWorkspace({ project: PROJECT })

		expect(jsonAnswerOf(runConfig(callOf({ workspace, argv: ['check', '--json'] })))).toEqual({
			exitCode: 0,
			json: { schema: 1, ok: true, findings: [], notes: [] },
		})
	})

	it('--json with a refused key and an unknown key → ok false, each finding with its refused flag, exit 1', () => {
		const workspace = createConfigWorkspace({ project: 'schema: 1\neditor: zed\nzzz: 1\n' })

		expect(jsonAnswerOf(runConfig(callOf({ workspace, argv: ['check', '--json'] })))).toEqual({
			exitCode: 1,
			json: {
				schema: 1,
				ok: false,
				findings: [
					{ file: workspace.projectFile, line: 2, key: 'editor', problem: ANY_TEXT, refused: true },
					{ file: workspace.projectFile, line: 3, key: 'zzz', problem: ANY_TEXT, refused: false },
				],
				notes: [],
			},
		})
	})
})

describe('config usage', { timeout: STORE_CASE_TIMEOUT }, () => {
	const CASES: { name: string; argv: string[] }[] = [
		{ name: 'no verb', argv: [] },
		{ name: 'an unknown verb', argv: ['frobnicate'] },
		{ name: 'get without a key', argv: ['get'] },
		{ name: 'set without a value', argv: ['set', 'editor', '--project'] },
		{ name: 'set without a target', argv: ['set', 'editor', 'zed'] },
		{ name: 'set with two targets', argv: ['set', 'editor', 'zed', '--project', '--personal'] },
		{ name: 'an unknown option', argv: ['list', '--bogus'] },
	]

	it.each(CASES)('$name → exit 2 with the usage lines', ({ argv }) => {
		const workspace = createConfigWorkspace({ project: PROJECT })

		expect(answerOf(runConfig(callOf({ workspace, argv })))).toEqual({
			exitCode: 2,
			lines: [...CONFIG_USAGE],
		})
	})
})
