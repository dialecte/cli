/** The project reader: `.dialecterc` and the environment, refusing what C8 and D6 refuse; no process spawned. */
import { join } from 'node:path'

import { findingOf, refusalFindingsOf } from '../../../test/config-workspace-refusal.ts'
import { HOST_PLATFORM } from '../../../test/config-workspace.constants.ts'
import { createConfigWorkspace } from '../../../test/config-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readProjectSettings } from './read-project-settings.ts'

import { describe, expect, it } from 'vitest'

import type { ConfigWorkspace } from '../../../test/config-workspace.types.ts'
import type { ConfigContext, ConfigKeySpec } from './config.types.ts'

/** The context of a call on a workspace, on the host platform. */
function contextOf(workspace: ConfigWorkspace): ConfigContext {
	return {
		root: workspace.root,
		environment: workspace.environment,
		platform: HOST_PLATFORM,
		home: workspace.home,
	}
}

describe('readProjectSettings', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('.dialecterc alone → exactly its keys and values', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\ngate:\n  fast: [check, test]\nreferences:\n  allow: [ticket number]\n',
		})

		expect(readProjectSettings(contextOf(workspace))).toEqual({
			gate: { fast: ['check', 'test'] },
			references: { allow: ['ticket number'] },
		})
	})

	it('a nested value is read through its typed shape, no cast', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\nreferences:\n  allow: [ticket number]\n',
		})

		const settings = readProjectSettings(contextOf(workspace))

		expect(settings.references?.allow).toEqual(['ticket number'])
	})

	it('nothing set → an empty object', () => {
		const workspace = createConfigWorkspace()

		expect(readProjectSettings(contextOf(workspace))).toEqual({})
	})

	it('a key naming a variable: the variable wins over the file', () => {
		const workspace = createConfigWorkspace({ project: 'schema: 1\ntempo: 3\n' })
		const keys: ConfigKeySpec[] = [
			{
				key: 'tempo',
				layer: 'project',
				repoOverride: false,
				environment: 'DIALECTE_TEST_TEMPO',
				description: 'a setting of the test',
				problemOf: () => undefined,
			},
		]

		expect(
			readProjectSettings({
				...contextOf(workspace),
				environment: { ...workspace.environment, DIALECTE_TEST_TEMPO: '7' },
				keys,
			}),
		).toEqual({ tempo: '7' })
	})

	it('a package.json "dialecte" setting → throws ConfigRefusal holding it', () => {
		const workspace = createConfigWorkspace({
			packageJson: '{\n  "name": "x",\n  "dialecte": {\n    "gate": {}\n  }\n}\n',
		})

		expect(refusalFindingsOf(() => readProjectSettings(contextOf(workspace)))).toEqual([
			findingOf({
				file: workspace.packageJsonFile,
				line: 4,
				key: 'dialecte.gate',
				problem: /\.dialecterc/,
			}),
		])
	})

	it('a package.json "dialecte" setting beside a valid .dialecterc → still refused (D1)', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\ngate:\n  fast: [check]\n',
			packageJson: '{\n  "name": "x",\n  "dialecte": {\n    "gate": {}\n  }\n}\n',
		})

		expect(refusalFindingsOf(() => readProjectSettings(contextOf(workspace)))).toEqual([
			findingOf({ file: workspace.packageJsonFile, line: 4, key: 'dialecte.gate' }),
		])
	})

	it('manifest keys in package.json (stepEvents, standard) → read as no setting', () => {
		const workspace = createConfigWorkspace({
			packageJson: '{\n  "dialecte": {\n    "stepEvents": 1,\n    "standard": "x"\n  }\n}\n',
		})

		expect(readProjectSettings(contextOf(workspace))).toEqual({})
	})

	it('a dialecte.json → throws ConfigRefusal holding it', () => {
		const workspace = createConfigWorkspace({ dialecteJson: '{ "gate": {} }\n' })

		expect(refusalFindingsOf(() => readProjectSettings(contextOf(workspace)))).toEqual([
			findingOf({
				file: workspace.dialecteJsonFile,
				line: 1,
				key: 'dialecte.json',
				problem: /\.dialecterc/,
			}),
		])
	})

	it('a personal key in .dialecterc → throws ConfigRefusal, then the old homes after it', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\neditor: zed\n',
			dialecteJson: '{}\n',
		})

		expect(refusalFindingsOf(() => readProjectSettings(contextOf(workspace)))).toEqual([
			findingOf({ file: workspace.projectFile, line: 2, key: 'editor' }),
			findingOf({ file: workspace.dialecteJsonFile, line: 1, key: 'dialecte.json' }),
		])
	})

	it('a wrong-layer key in the personal file does not stop the project settings', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\nbaseBranch: main\n',
			personal: 'schema: 1\ngate:\n  fast: [check]\n',
		})

		expect(readProjectSettings(contextOf(workspace))).toEqual({ baseBranch: 'main' })
	})

	it('a git key that config.yml lacks does not stop the project settings (no git read)', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\nbaseBranch: main\n',
			gitConfig: { 'dialecte.editor': 'zed' },
		})

		expect(readProjectSettings(contextOf(workspace))).toEqual({ baseBranch: 'main' })
	})

	it('a root with no repository and no folder → no repository key computed, no setting', () => {
		const root = join(temporaryFolder('dialecte-no-root-'), 'missing')
		const workspace = createConfigWorkspace()

		expect(readProjectSettings({ ...contextOf(workspace), root })).toEqual({})
	})
})
