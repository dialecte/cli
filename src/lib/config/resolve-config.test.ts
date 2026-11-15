/** Every effective value with its source (D5), the refusals (D6), the unknown keys, the environment layer. */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { HOST_PLATFORM, WORKSPACE_REPO_KEY } from '../../../test/config-workspace.constants.ts'
import { createConfigWorkspace } from '../../../test/config-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { personalConfigFileOf } from './personal-config-file-of.ts'
import { resolveConfig } from './resolve-config.ts'

import { describe, expect, it } from 'vitest'

import type { ConfigWorkspace } from '../../../test/config-workspace.types.ts'
import type { ConfigContext, ConfigFinding, ConfigKeySpec } from './config.types.ts'

/** The context of a call on a workspace, on the host platform. */
function contextOf(workspace: ConfigWorkspace): ConfigContext {
	return {
		root: workspace.root,
		environment: workspace.environment,
		platform: HOST_PLATFORM,
		home: workspace.home,
	}
}

/** A finding at `file:line` on `key`, its wording free. */
function finding(params: { file: string; line: number; key?: string }): ConfigFinding {
	return { ...params, problem: expect.stringMatching(/\S/) as unknown as string }
}

describe('resolveConfig', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('no file anywhere → no value, no finding, both files and the repo key filled', () => {
		const workspace = createConfigWorkspace()

		expect(resolveConfig(contextOf(workspace))).toEqual({
			projectFile: workspace.projectFile,
			personalFile: workspace.personalFile,
			repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
			values: [],
			refusals: [],
			findings: [],
		})
	})

	describe('precedence', () => {
		function personal(repoKey: string): string {
			return `schema: 1\neditor: zed\nrepos:\n  ${repoKey}:\n    editor: code\n`
		}

		it('the repos entry of this repository (https key, ssh origin) beats the personal top level', () => {
			const workspace = createConfigWorkspace({
				personal: personal('https://github.com/example/repo.git'),
			})

			expect(resolveConfig(contextOf(workspace)).values).toEqual([
				{
					key: 'editor',
					value: 'code',
					source: {
						kind: 'repo',
						file: workspace.personalFile,
						line: 5,
						repo: WORKSPACE_REPO_KEY,
					},
				},
			])
		})

		it('a repos entry of another repository is not used', () => {
			const workspace = createConfigWorkspace({ personal: personal('github.com/example/other') })

			expect(resolveConfig(contextOf(workspace)).values).toEqual([
				{
					key: 'editor',
					value: 'zed',
					source: { kind: 'personal', file: workspace.personalFile, line: 2 },
				},
			])
		})

		it('the personal top level alone → source personal with its line', () => {
			const workspace = createConfigWorkspace({ personal: 'schema: 1\n\neditor: zed\n' })

			expect(resolveConfig(contextOf(workspace)).values).toEqual([
				{
					key: 'editor',
					value: 'zed',
					source: { kind: 'personal', file: workspace.personalFile, line: 3 },
				},
			])
		})

		it('a project key → source project with its line', () => {
			const workspace = createConfigWorkspace({ project: 'schema: 1\nbaseBranch: main\n' })

			expect(resolveConfig(contextOf(workspace)).values).toEqual([
				{
					key: 'baseBranch',
					value: 'main',
					source: { kind: 'project', file: workspace.projectFile, line: 2 },
				},
			])
		})
	})

	describe('wrong layer', () => {
		it('a personal key in .dialecterc → refused on its line, absent from the values', () => {
			const workspace = createConfigWorkspace({ project: 'schema: 1\neditor: zed\n' })
			const refusal = finding({ file: workspace.projectFile, line: 2, key: 'editor' })

			expect(resolveConfig(contextOf(workspace))).toEqual({
				projectFile: workspace.projectFile,
				personalFile: workspace.personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [],
				refusals: [refusal],
				findings: [refusal],
			})
		})

		it('a project key in config.yml → refused on the personal file', () => {
			const workspace = createConfigWorkspace({ personal: 'schema: 1\ngate:\n  fast: [check]\n' })
			const refusal = finding({ file: workspace.personalFile, line: 2, key: 'gate' })

			expect(resolveConfig(contextOf(workspace))).toEqual({
				projectFile: workspace.projectFile,
				personalFile: workspace.personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [],
				refusals: [refusal],
				findings: [refusal],
			})
		})

		it('corpora inside a repos entry → refused (not overridable), absent from the values', () => {
			const workspace = createConfigWorkspace({
				personal: `schema: 1\nrepos:\n  ${WORKSPACE_REPO_KEY}:\n    corpora:\n      a: { xsd: /x }\n`,
			})
			const refusal = finding({ file: workspace.personalFile, line: 4, key: 'corpora' })

			expect(resolveConfig(contextOf(workspace))).toEqual({
				projectFile: workspace.projectFile,
				personalFile: workspace.personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [],
				refusals: [refusal],
				findings: [refusal],
			})
		})
	})

	describe('a value failing its check', () => {
		const CASES: {
			name: string
			key: string
			file: 'projectFile' | 'personalFile'
			project?: string
			personal?: string
		}[] = [
			{
				name: 'references.allow not a list',
				key: 'references',
				file: 'projectFile',
				project: 'references:\n  allow: x\n',
			},
			{
				name: 'gate not an object',
				key: 'gate',
				file: 'projectFile',
				project: 'gate: fast\n',
			},
			{
				name: 'load.budget below 1',
				key: 'load',
				file: 'personalFile',
				personal: 'load:\n  budget: 0\n',
			},
			{
				name: 'load.budget not an integer',
				key: 'load',
				file: 'personalFile',
				personal: 'load:\n  budget: 1.5\n',
			},
			{ name: 'editor not a string', key: 'editor', file: 'personalFile', personal: 'editor: 3\n' },
			{
				name: 'corpora entry without xsd',
				key: 'corpora',
				file: 'personalFile',
				personal: 'corpora:\n  a:\n    instances: /x\n',
			},
		]

		it.each(CASES)('$name → refused on the key line, absent from the values', (testCase) => {
			const workspace = createConfigWorkspace({
				project: testCase.project && `schema: 1\n${testCase.project}`,
				personal: testCase.personal && `schema: 1\n${testCase.personal}`,
			})
			const file = workspace[testCase.file]
			const refusal = finding({ file, line: 2, key: testCase.key })

			expect(resolveConfig(contextOf(workspace))).toEqual({
				projectFile: workspace.projectFile,
				personalFile: workspace.personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [],
				refusals: [refusal],
				findings: [refusal],
			})
		})
	})

	it('an unknown key → a finding only: not a refusal, not a value', () => {
		const workspace = createConfigWorkspace({ project: 'schema: 1\ngaet: x\n' })

		expect(resolveConfig(contextOf(workspace))).toEqual({
			projectFile: workspace.projectFile,
			personalFile: workspace.personalFile,
			repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
			values: [],
			refusals: [],
			findings: [finding({ file: workspace.projectFile, line: 2, key: 'gaet' })],
		})
	})

	it('values come in registry order, project keys first', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\nbaseBranch: main\n',
			personal: 'schema: 1\nload:\n  budget: 4\n\neditor: zed\n',
		})

		expect(
			resolveConfig(contextOf(workspace)).values.map((configValue) => configValue.key),
		).toEqual(['baseBranch', 'editor', 'load'])
	})

	it('the highest layer wins the whole key: a repos load {} replaces the top level load', () => {
		const workspace = createConfigWorkspace({
			personal: `schema: 1\nload:\n  budget: 10\nrepos:\n  ${WORKSPACE_REPO_KEY}:\n    load: {}\n`,
		})

		expect(resolveConfig(contextOf(workspace)).values).toEqual([
			{
				key: 'load',
				value: {},
				source: { kind: 'repo', file: workspace.personalFile, line: 6, repo: WORKSPACE_REPO_KEY },
			},
		])
	})

	it('a repository without origin: its repos entry is keyed by its real path, case ignored on darwin', () => {
		const workspace = createConfigWorkspace({ origin: null, rootName: 'MixedCase' })
		const key = realpathSync(workspace.root).toUpperCase()
		mkdirSync(dirname(workspace.personalFile), { recursive: true })
		writeFileSync(
			workspace.personalFile,
			`schema: 1\neditor: zed\nrepos:\n  ${key}:\n    editor: code\n`,
		)

		expect(resolveConfig({ ...contextOf(workspace), platform: 'darwin' }).values).toEqual([
			{
				key: 'editor',
				value: 'code',
				source: {
					kind: 'repo',
					file: personalConfigFileOf({
						environment: workspace.environment,
						platform: 'darwin',
						home: workspace.home,
					}),
					line: 5,
					repo: key.toLowerCase(),
				},
			},
		])
	})

	describe('a file-level finding refuses the whole file', () => {
		const CASES: {
			name: string
			file: 'projectFile' | 'personalFile'
			line: number
			key?: string
			project?: string
			personal?: string
		}[] = [
			{
				name: '.dialecterc without schema',
				file: 'projectFile',
				line: 1,
				key: 'schema',
				project: 'baseBranch: main\n',
			},
			{
				name: '.dialecterc schema 2',
				file: 'projectFile',
				line: 1,
				key: 'schema',
				project: 'schema: 2\nbaseBranch: main\n',
			},
			{
				name: '.dialecterc broken YAML',
				file: 'projectFile',
				line: 3,
				project: 'schema: 1\nbaseBranch: main\nbaseBranch: x\n',
			},
			{
				name: 'config.yml schema 2',
				file: 'personalFile',
				line: 1,
				key: 'schema',
				personal: 'schema: 2\neditor: zed\n',
			},
			{
				name: 'config.yml broken YAML',
				file: 'personalFile',
				line: 3,
				personal: 'schema: 1\neditor: zed\neditor: x\n',
			},
		]

		it.each(CASES)('$name → refusal = finding, no value', (testCase) => {
			const workspace = createConfigWorkspace({
				project: testCase.project,
				personal: testCase.personal,
			})
			const refusal = finding({
				file: workspace[testCase.file],
				line: testCase.line,
				key: testCase.key,
			})

			expect(resolveConfig(contextOf(workspace))).toEqual({
				projectFile: workspace.projectFile,
				personalFile: workspace.personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [],
				refusals: [refusal],
				findings: [refusal],
			})
		})
	})

	describe('inside a repos entry (every check of a key applies)', () => {
		function entryText(line: string): string {
			return `schema: 1\nrepos:\n  ${WORKSPACE_REPO_KEY}:\n    ${line}\n`
		}

		it.each([
			{ name: 'a bad value', line: 'editor: 3', key: 'editor' },
			{ name: 'a project key', line: 'gate: {}', key: 'gate' },
		])('$name → refusal on the key line, absent from the values', ({ line, key }) => {
			const workspace = createConfigWorkspace({ personal: entryText(line) })
			const refusal = finding({ file: workspace.personalFile, line: 4, key })

			expect(resolveConfig(contextOf(workspace))).toEqual({
				projectFile: workspace.projectFile,
				personalFile: workspace.personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [],
				refusals: [refusal],
				findings: [refusal],
			})
		})

		it('an unknown key → a finding only', () => {
			const workspace = createConfigWorkspace({ personal: entryText('gaet: 1') })

			expect(resolveConfig(contextOf(workspace))).toEqual({
				projectFile: workspace.projectFile,
				personalFile: workspace.personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [],
				refusals: [],
				findings: [finding({ file: workspace.personalFile, line: 4, key: 'gaet' })],
			})
		})
	})

	it('repos: in .dialecterc → a wrong-layer refusal', () => {
		const workspace = createConfigWorkspace({ project: 'schema: 1\nrepos:\n  a: {}\n' })
		const refusal = finding({ file: workspace.projectFile, line: 2, key: 'repos' })

		expect(resolveConfig(contextOf(workspace))).toEqual({
			projectFile: workspace.projectFile,
			personalFile: workspace.personalFile,
			repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
			values: [],
			refusals: [refusal],
			findings: [refusal],
		})
	})

	it('an unknown key in config.yml → a finding only', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 1\ngaet: x\n' })

		expect(resolveConfig(contextOf(workspace))).toEqual({
			projectFile: workspace.projectFile,
			personalFile: workspace.personalFile,
			repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
			values: [],
			refusals: [],
			findings: [finding({ file: workspace.personalFile, line: 2, key: 'gaet' })],
		})
	})

	it('findings come in file order: the project file, then the personal file; inside a file, line order', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\ngaet: x\neditor: zed\n',
			personal: `schema: 1\nrepos:\n  ${WORKSPACE_REPO_KEY}:\n    gaet: 1\neditor: 3\n`,
		})
		const project = workspace.projectFile
		const personal = workspace.personalFile
		const result = resolveConfig(contextOf(workspace))

		expect({ refusals: result.refusals, findings: result.findings }).toEqual({
			refusals: [
				finding({ file: project, line: 3, key: 'editor' }),
				finding({ file: personal, line: 5, key: 'editor' }),
			],
			findings: [
				finding({ file: project, line: 2, key: 'gaet' }),
				finding({ file: project, line: 3, key: 'editor' }),
				finding({ file: personal, line: 4, key: 'gaet' }),
				finding({ file: personal, line: 5, key: 'editor' }),
			],
		})
	})

	describe('repos: entries (D14)', () => {
		it('two entries normalizing to one repository → a finding on the second entry, the first used', () => {
			const workspace = createConfigWorkspace({
				personal:
					'schema: 1\nrepos:\n  https://github.com/example/repo.git:\n    editor: code\n  git@github.com:example/repo.git:\n    editor: vim\n',
			})
			const result = resolveConfig(contextOf(workspace))

			expect({
				values: result.values,
				refusals: result.refusals,
				findings: result.findings,
			}).toEqual({
				values: [
					{
						key: 'editor',
						value: 'code',
						source: {
							kind: 'repo',
							file: workspace.personalFile,
							line: 4,
							repo: WORKSPACE_REPO_KEY,
						},
					},
				],
				refusals: [],
				findings: [finding({ file: workspace.personalFile, line: 5, key: 'repos' })],
			})
		})

		it('repos that is not a mapping → a file-level refusal on its line', () => {
			const workspace = createConfigWorkspace({ personal: 'schema: 1\nrepos: 3\neditor: zed\n' })
			const refusal = finding({ file: workspace.personalFile, line: 2, key: 'repos' })

			expect(resolveConfig(contextOf(workspace))).toEqual({
				projectFile: workspace.projectFile,
				personalFile: workspace.personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [],
				refusals: [refusal],
				findings: [refusal],
			})
		})

		it('a repos entry that is not a mapping → a file-level refusal on the entry line', () => {
			const workspace = createConfigWorkspace({
				personal: `schema: 1\nrepos:\n  ${WORKSPACE_REPO_KEY}: 3\neditor: zed\n`,
			})
			const refusal = finding({ file: workspace.personalFile, line: 3, key: 'repos' })

			expect(resolveConfig(contextOf(workspace))).toEqual({
				projectFile: workspace.projectFile,
				personalFile: workspace.personalFile,
				repo: { key: WORKSPACE_REPO_KEY, from: 'remote' },
				values: [],
				refusals: [refusal],
				findings: [refusal],
			})
		})
	})

	it("layers: ['project'] resolves the project file alone: no repository key, the personal file unread", () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\nbaseBranch: main\n',
			personal: 'schema: 2\neditor: zed\n',
		})
		const result = resolveConfig({ ...contextOf(workspace), layers: ['project'] })

		expect({
			repo: result.repo,
			values: result.values,
			refusals: result.refusals,
			findings: result.findings,
		}).toEqual({
			repo: undefined,
			values: [
				{
					key: 'baseBranch',
					value: 'main',
					source: { kind: 'project', file: workspace.projectFile, line: 2 },
				},
			],
			refusals: [],
			findings: [],
		})
	})

	it('a key naming a variable: the environment wins over the file, as the variable text', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 1\nbudgetSwitch: 3\n' })
		const keys: ConfigKeySpec[] = [
			{
				key: 'budgetSwitch',
				layer: 'personal',
				repoOverride: true,
				environment: 'DIALECTE_TEST_SWITCH',
				description: 'a switch of the test',
				problemOf: () => undefined,
			},
		]

		expect(
			resolveConfig({
				...contextOf(workspace),
				environment: { ...workspace.environment, DIALECTE_TEST_SWITCH: '7' },
				keys,
			}).values,
		).toEqual([
			{
				key: 'budgetSwitch',
				value: '7',
				source: { kind: 'environment', variable: 'DIALECTE_TEST_SWITCH' },
			},
		])
	})
})
