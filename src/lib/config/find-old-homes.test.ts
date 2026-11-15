/** The old homes (C8, U2): package.json `"dialecte"`, dialecte.json, the git keys and the forbidden-words file. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { findingOf } from '../../../test/config-workspace-refusal.ts'
import { HOST_PLATFORM } from '../../../test/config-workspace.constants.ts'
import { createConfigWorkspace } from '../../../test/config-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { CONFIG_KEYS } from './config-keys.constants.ts'
import { findOldHomes } from './find-old-homes.ts'

import { describe, expect, it } from 'vitest'

import type { ConfigWorkspace } from '../../../test/config-workspace.types.ts'
import type { ConfigContext } from './config.types.ts'

/** The context of a call on a workspace, on the host platform. */
function contextOf(workspace: ConfigWorkspace): ConfigContext {
	return {
		root: workspace.root,
		environment: workspace.environment,
		platform: HOST_PLATFORM,
		home: workspace.home,
	}
}

/** A package.json whose `"dialecte"` table holds `lines` (one member per line, from line 4). */
function packageJsonOf(lines: string[]): string {
	return `{\n  "name": "x",\n  "dialecte": {\n${lines.map((line) => `    ${line}`).join(',\n')}\n  }\n}\n`
}

const NO_OLD_HOME = { refusals: [], notes: [] }

describe(
	'findOldHomes, project layer (package.json, dialecte.json)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		const CASES: {
			name: string
			packageJson?: string
			refusals: { line: number; key: string; problem: RegExp }[]
		}[] = [
			{
				name: 'a gate setting → refused on its line, naming .dialecterc and gate',
				packageJson: packageJsonOf(['"gate": { "fast": ["check"] }']),
				refusals: [{ line: 4, key: 'dialecte.gate', problem: /\.dialecterc.*\bgate\b/s }],
			},
			{
				name: 'allowReferences → the problem names references.allow',
				packageJson: packageJsonOf(['"allowReferences": ["ticket number"]']),
				refusals: [
					{ line: 4, key: 'dialecte.allowReferences', problem: /\.dialecterc.*references\.allow/s },
				],
			},
			{
				name: 'referencePatterns → the problem names references.patterns',
				packageJson: packageJsonOf(['"referencePatterns": ["x"]']),
				refusals: [
					{
						line: 4,
						key: 'dialecte.referencePatterns',
						problem: /\.dialecterc.*references\.patterns/s,
					},
				],
			},
			{
				name: 'profile and gate → two refusals, in line order',
				packageJson: packageJsonOf(['"profile": "contributor"', '"gate": {}']),
				refusals: [
					{ line: 4, key: 'dialecte.profile', problem: /\.dialecterc.*\bprofile\b/s },
					{ line: 5, key: 'dialecte.gate', problem: /\.dialecterc.*\bgate\b/s },
				],
			},
			{
				name: 'stepEvents and standard are manifest keys → nothing',
				packageJson: packageJsonOf(['"stepEvents": 1', '"standard": "x"']),
				refusals: [],
			},
			{
				name: 'a manifest key beside a setting → only the setting is refused',
				packageJson: packageJsonOf(['"stepEvents": 1', '"baseBranch": "main"']),
				refusals: [{ line: 5, key: 'dialecte.baseBranch', problem: /\.dialecterc.*baseBranch/s }],
			},
			{
				name: 'a multi-line member before the refused keys → each refused on its real line',
				packageJson: packageJsonOf([
					'"stepEvents": 1',
					'"gate": {\n      "fast": ["check"]\n    }',
					'"profile": "x"',
				]),
				refusals: [
					{ line: 5, key: 'dialecte.gate', problem: /\.dialecterc.*\bgate\b/s },
					{ line: 8, key: 'dialecte.profile', problem: /\.dialecterc.*\bprofile\b/s },
				],
			},
			{
				name: 'a package.json without "dialecte" → nothing',
				packageJson: '{\n  "name": "x"\n}\n',
				refusals: [],
			},
			{ name: 'no package.json → nothing', refusals: [] },
		]

		it.each(CASES)('$name', ({ packageJson, refusals }) => {
			const workspace = createConfigWorkspace({ packageJson })

			expect(findOldHomes({ context: contextOf(workspace), layer: 'project' })).toEqual({
				refusals: refusals.map((refusal) =>
					findingOf({ file: workspace.packageJsonFile, ...refusal }),
				),
				notes: [],
			})
		})

		const PROJECT_KEYS = CONFIG_KEYS.filter((spec) => spec.layer === 'project').map(
			(spec) => spec.key,
		)

		it.each(PROJECT_KEYS)('the project key %s in package.json "dialecte" → refused', (key) => {
			const workspace = createConfigWorkspace({ packageJson: packageJsonOf([`"${key}": "x"`]) })

			expect(findOldHomes({ context: contextOf(workspace), layer: 'project' })).toEqual({
				refusals: [
					findingOf({
						file: workspace.packageJsonFile,
						line: 4,
						key: `dialecte.${key}`,
						problem: new RegExp(`\\.dialecterc.*\\b${key}\\b`, 's'),
					}),
				],
				notes: [],
			})
		})

		it('both .dialecterc and package.json "dialecte" → still refused (D1)', () => {
			const workspace = createConfigWorkspace({
				project: 'schema: 1\ngate:\n  fast: [check]\n',
				packageJson: packageJsonOf(['"gate": {}']),
			})

			expect(findOldHomes({ context: contextOf(workspace), layer: 'project' })).toEqual({
				refusals: [
					findingOf({
						file: workspace.packageJsonFile,
						line: 4,
						key: 'dialecte.gate',
						problem: /\.dialecterc/,
					}),
				],
				notes: [],
			})
		})

		it('a dialecte.json → one refusal at line 1 naming .dialecterc', () => {
			const workspace = createConfigWorkspace({ dialecteJson: '{ "gate": {} }\n' })

			expect(findOldHomes({ context: contextOf(workspace), layer: 'project' })).toEqual({
				refusals: [
					findingOf({
						file: workspace.dialecteJsonFile,
						line: 1,
						key: 'dialecte.json',
						problem: /\.dialecterc/,
					}),
				],
				notes: [],
			})
		})

		it('the project layer reads neither the git keys nor the forbidden-words file', () => {
			const workspace = createConfigWorkspace({
				gitConfig: { 'dialecte.editor': 'zed' },
				forbiddenWords: 'alpha\n',
			})

			expect(findOldHomes({ context: contextOf(workspace), layer: 'project' })).toEqual(NO_OLD_HOME)
		})
	},
)

describe('findOldHomes, personal layer, git keys (U2)', { timeout: STORE_CASE_TIMEOUT }, () => {
	type GitCase = { name: string; key: string; value: string; personal?: string }

	const NOTES: GitCase[] = [
		{
			name: 'editor with the same text in config.yml → a note, no refusal',
			key: 'dialecte.editor',
			value: 'zed',
			personal: 'schema: 1\neditor: zed\n',
		},
		{
			name: 'forbiddenWords "Alpha, beta" with [alpha, Beta, gamma] → a note (case ignored)',
			key: 'dialecte.forbiddenWords',
			value: 'Alpha, beta',
			personal: 'schema: 1\nforbiddenWords: [alpha, Beta, gamma]\n',
		},
		{
			name: 'consumerNames with every word in config.yml → a note',
			key: 'dialecte.consumerNames',
			value: 'Acme,Globex',
			personal: 'schema: 1\nconsumerNames: [globex, acme]\n',
		},
	]

	const REFUSALS: GitCase[] = [
		{ name: 'editor set, no config.yml → refused', key: 'dialecte.editor', value: 'zed' },
		{
			name: 'editor set, config.yml holding other keys only → refused',
			key: 'dialecte.editor',
			value: 'zed',
			personal: 'schema: 1\nload:\n  budget: 2\n',
		},
		{
			name: 'editor with another text in config.yml → refused',
			key: 'dialecte.editor',
			value: 'zed',
			personal: 'schema: 1\neditor: code\n',
		},
		{
			name: 'editor Zed against config.yml zed → refused (editor is exact text)',
			key: 'dialecte.editor',
			value: 'Zed',
			personal: 'schema: 1\neditor: zed\n',
		},
		{
			name: 'editor held only by a repos entry, not the top level → refused',
			key: 'dialecte.editor',
			value: 'zed',
			personal: 'schema: 1\nrepos:\n  github.com/example/repo:\n    editor: zed\n',
		},
		{
			name: 'forbiddenWords with a word missing from config.yml → refused',
			key: 'dialecte.forbiddenWords',
			value: 'Alpha, beta',
			personal: 'schema: 1\nforbiddenWords: [alpha, gamma]\n',
		},
		{
			name: 'personProcesses with a word missing from config.yml → refused',
			key: 'dialecte.personProcesses',
			value: 'zsh, fish',
			personal: 'schema: 1\npersonProcesses: [zsh]\n',
		},
	]

	it.each(NOTES)('$name', ({ key, value, personal }) => {
		const workspace = createConfigWorkspace({ personal, gitConfig: { [key]: value } })

		expect(findOldHomes({ context: contextOf(workspace), layer: 'personal' })).toEqual({
			refusals: [],
			notes: [expect.stringMatching(new RegExp(`${key}.*git config --unset ${key}`, 's'))],
		})
	})

	it.each(REFUSALS)('$name', ({ key, value, personal }) => {
		const workspace = createConfigWorkspace({ personal, gitConfig: { [key]: value } })
		const configKey = key.replace('dialecte.', '')

		expect(findOldHomes({ context: contextOf(workspace), layer: 'personal' })).toEqual({
			refusals: [
				findingOf({
					file: 'git config',
					line: 0,
					key,
					problem: new RegExp(`config\\.yml.*${configKey}`, 's'),
				}),
			],
			notes: [],
		})
	})

	const EMPTY_KEYS = [
		{ name: 'an empty dialecte.editor', key: 'dialecte.editor' },
		{ name: 'an empty list key (personProcesses)', key: 'dialecte.personProcesses' },
		{ name: 'an empty forbiddenWords', key: 'dialecte.forbiddenWords' },
	]

	it.each(EMPTY_KEYS)('$name with nothing in config.yml → a note, no refusal (D17)', ({ key }) => {
		const workspace = createConfigWorkspace({ gitConfig: { [key]: '' } })

		expect(findOldHomes({ context: contextOf(workspace), layer: 'personal' })).toEqual({
			refusals: [],
			notes: [expect.stringMatching(new RegExp(`${key}.*git config --unset ${key}`, 's'))],
		})
	})

	it('no git key, no file → nothing', () => {
		const workspace = createConfigWorkspace()

		expect(findOldHomes({ context: contextOf(workspace), layer: 'personal' })).toEqual(NO_OLD_HOME)
	})

	it('the personal layer reads neither package.json nor dialecte.json', () => {
		const workspace = createConfigWorkspace({
			packageJson: packageJsonOf(['"gate": {}']),
			dialecteJson: '{}\n',
		})

		expect(findOldHomes({ context: contextOf(workspace), layer: 'personal' })).toEqual(NO_OLD_HOME)
	})
})

describe(
	'findOldHomes, personal layer, forbidden-words file (U2)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		const NOTES = [
			{
				name: 'every word in config.yml (comments and blank lines skipped) → a note',
				forbiddenWords: '# the words\nalpha\n\nbeta\n',
				personal: 'schema: 1\nforbiddenWords: [alpha, beta, gamma]\n',
			},
			{
				name: 'a word in another case than config.yml → a note',
				forbiddenWords: 'Alpha\n',
				personal: 'schema: 1\nforbiddenWords: [alpha]\n',
			},
			{
				name: 'a padded word reads trimmed → a note',
				forbiddenWords: '  alpha  \n',
				personal: 'schema: 1\nforbiddenWords: [alpha]\n',
			},
			{
				name: 'a CRLF file with every word → a note',
				forbiddenWords: '# the words\r\nalpha\r\n\r\nbeta\r\n',
				personal: 'schema: 1\nforbiddenWords: [alpha, beta]\n',
			},
		]

		const REFUSALS = [
			{
				name: 'a word missing on line 3 → refused at line 3',
				forbiddenWords: 'alpha\n# a comment\ngamma\n',
				personal: 'schema: 1\nforbiddenWords: [alpha]\n',
				line: 3,
				word: 'gamma',
			},
			{
				name: 'words missing on lines 2 and 4 → refused at line 2 (the first)',
				forbiddenWords: 'alpha\nbeta\n# c\ngamma\n',
				personal: 'schema: 1\nforbiddenWords: [alpha]\n',
				line: 2,
				word: 'beta',
			},
			{
				name: 'a CRLF file with a word missing on line 2 → refused at line 2',
				forbiddenWords: 'alpha\r\nbeta\r\n',
				personal: 'schema: 1\nforbiddenWords: [alpha]\n',
				line: 2,
				word: 'beta',
			},
			{
				name: 'config.yml without forbiddenWords → refused at the first word',
				forbiddenWords: '\nalpha\n',
				personal: 'schema: 1\neditor: zed\n',
				line: 2,
				word: 'alpha',
			},
		]

		it('a file of comments and blank lines only, no config.yml → a note, no refusal (D17)', () => {
			const workspace = createConfigWorkspace({ forbiddenWords: '# the words\n\n  # none yet\n' })

			expect(findOldHomes({ context: contextOf(workspace), layer: 'personal' })).toEqual({
				refusals: [],
				notes: [expect.stringMatching(/forbidden-words.*delete it/s)],
			})
		})

		it('win32 with APPDATA and no XDG → the old file is read where the old reader looked, <home>/.config', () => {
			const workspace = createConfigWorkspace({ personal: 'schema: 1\neditor: zed\n' })
			const folder = join(workspace.home, '.config', 'dialecte')
			mkdirSync(folder, { recursive: true })
			writeFileSync(join(folder, 'forbidden-words'), '# the words\nalpha\n')
			const context: ConfigContext = {
				root: workspace.root,
				environment: { APPDATA: temporaryFolder('dialecte-appdata-') },
				platform: 'win32',
				home: workspace.home,
			}

			expect(findOldHomes({ context, layer: 'personal' })).toEqual({
				refusals: [
					{
						file: expect.stringMatching(/\.config.dialecte.forbidden-words$/) as unknown as string,
						line: 2,
						key: 'forbidden-words',
						problem: expect.stringMatching(/config\.yml.*alpha/s) as unknown as string,
					},
				],
				notes: [],
			})
		})

		it('environment HOME differs from context.home, no XDG → the old file is looked up under HOME, as the old reader does', () => {
			const workspace = createConfigWorkspace({ personal: 'schema: 1\neditor: zed\n' })
			const environmentHome = temporaryFolder('dialecte-env-home-')
			const folder = join(environmentHome, '.config', 'dialecte')
			mkdirSync(folder, { recursive: true })
			writeFileSync(join(folder, 'forbidden-words'), '# the words\nalpha\n')
			const context: ConfigContext = {
				root: workspace.root,
				environment: { HOME: environmentHome },
				platform: 'linux',
				home: workspace.home,
			}

			expect(findOldHomes({ context, layer: 'personal' })).toEqual({
				refusals: [
					{
						file: join(folder, 'forbidden-words'),
						line: 2,
						key: 'forbidden-words',
						problem: expect.stringMatching(/config\.yml.*alpha/s) as unknown as string,
					},
				],
				notes: [],
			})
		})

		it('a path that is a folder, so it cannot be read → refused at line 0 (D17)', () => {
			const workspace = createConfigWorkspace({ personal: 'schema: 1\nforbiddenWords: [alpha]\n' })
			mkdirSync(workspace.forbiddenWordsFile, { recursive: true })

			expect(findOldHomes({ context: contextOf(workspace), layer: 'personal' })).toEqual({
				refusals: [
					findingOf({
						file: workspace.forbiddenWordsFile,
						line: 0,
						key: 'forbidden-words',
						problem: /cannot be read/,
					}),
				],
				notes: [],
			})
		})

		it.each(NOTES)('$name', ({ forbiddenWords, personal }) => {
			const workspace = createConfigWorkspace({ personal, forbiddenWords })

			expect(findOldHomes({ context: contextOf(workspace), layer: 'personal' })).toEqual({
				refusals: [],
				notes: [expect.stringContaining('forbidden-words')],
			})
		})

		it.each(REFUSALS)('$name', ({ forbiddenWords, personal, line, word }) => {
			const workspace = createConfigWorkspace({ personal, forbiddenWords })

			expect(findOldHomes({ context: contextOf(workspace), layer: 'personal' })).toEqual({
				refusals: [
					findingOf({
						file: workspace.forbiddenWordsFile,
						line,
						key: 'forbidden-words',
						problem: new RegExp(`config\\.yml.*${word}`, 's'),
					}),
				],
				notes: [],
			})
		})
	},
)
