/** The personal reader: config.yml with the repos override, refusing what D6 and U2 refuse, noting the old copies. */
import { findingOf, refusalFindingsOf } from '../../../test/config-workspace-refusal.ts'
import { HOST_PLATFORM, WORKSPACE_REPO_KEY } from '../../../test/config-workspace.constants.ts'
import { createConfigWorkspace } from '../../../test/config-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readPersonalSettings } from './read-personal-settings.ts'

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

describe('readPersonalSettings', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('nothing set → no value, no note', () => {
		const workspace = createConfigWorkspace()

		expect(readPersonalSettings(contextOf(workspace))).toEqual({ values: {}, notes: [] })
	})

	it('the repos entry of this repository beats the top level; project keys are not read', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\nbaseBranch: main\n',
			personal: `schema: 1\neditor: zed\nforbiddenWords: [alpha]\nrepos:\n  https://github.com/example/repo.git:\n    editor: code\n`,
		})

		expect(readPersonalSettings(contextOf(workspace))).toEqual({
			values: { editor: 'code', forbiddenWords: ['alpha'] },
			notes: [],
		})
	})

	it('a repos entry of another repository is not used', () => {
		const workspace = createConfigWorkspace({
			personal: 'schema: 1\neditor: zed\nrepos:\n  github.com/example/other:\n    editor: code\n',
		})

		expect(readPersonalSettings(contextOf(workspace))).toEqual({
			values: { editor: 'zed' },
			notes: [],
		})
	})

	it('a git key and the forbidden-words file config.yml holds → the notes, no refusal', () => {
		const workspace = createConfigWorkspace({
			personal: `schema: 1\neditor: zed\nforbiddenWords: [alpha]\nrepos:\n  ${WORKSPACE_REPO_KEY}:\n    editor: code\n`,
			gitConfig: { 'dialecte.editor': 'zed' },
			forbiddenWords: 'alpha\n',
		})

		expect(readPersonalSettings(contextOf(workspace))).toEqual({
			values: { editor: 'code', forbiddenWords: ['alpha'] },
			notes: [
				expect.stringMatching(/dialecte\.editor.*git config --unset dialecte\.editor/s),
				expect.stringContaining('forbidden-words'),
			],
		})
	})

	it('a wrong-layer key in .dialecterc → throws ConfigRefusal naming .dialecterc, its line and the key', () => {
		const workspace = createConfigWorkspace({
			project: 'schema: 1\nbaseBranch: main\neditor: zed\n',
		})

		expect(refusalFindingsOf(() => readPersonalSettings(contextOf(workspace)))).toEqual([
			findingOf({ file: workspace.projectFile, line: 3, key: 'editor' }),
		])
	})

	it('a value failing its check in config.yml → throws ConfigRefusal on its line', () => {
		const workspace = createConfigWorkspace({ personal: 'schema: 1\neditor: 3\n' })

		expect(refusalFindingsOf(() => readPersonalSettings(contextOf(workspace)))).toEqual([
			findingOf({ file: workspace.personalFile, line: 2, key: 'editor' }),
		])
	})

	it('an unmigrated git key → throws ConfigRefusal naming the key, after the file refusals', () => {
		const workspace = createConfigWorkspace({
			personal: 'schema: 1\neditor: 3\n',
			gitConfig: { 'dialecte.consumerNames': 'Acme' },
		})

		expect(refusalFindingsOf(() => readPersonalSettings(contextOf(workspace)))).toEqual([
			findingOf({ file: workspace.personalFile, line: 2, key: 'editor' }),
			findingOf({ file: 'git config', line: 0, key: 'dialecte.consumerNames' }),
		])
	})

	it('an unmigrated forbidden-words file → throws ConfigRefusal at its line', () => {
		const workspace = createConfigWorkspace({
			personal: 'schema: 1\neditor: zed\n',
			forbiddenWords: 'alpha\n',
		})

		expect(refusalFindingsOf(() => readPersonalSettings(contextOf(workspace)))).toEqual([
			findingOf({ file: workspace.forbiddenWordsFile, line: 1, key: 'forbidden-words' }),
		])
	})

	it('a package.json "dialecte" setting is the project reader\'s: not refused here', () => {
		const workspace = createConfigWorkspace({
			packageJson: '{\n  "dialecte": {\n    "gate": {}\n  }\n}\n',
			personal: 'schema: 1\neditor: zed\n',
		})

		expect(readPersonalSettings(contextOf(workspace))).toEqual({
			values: { editor: 'zed' },
			notes: [],
		})
	})
})
