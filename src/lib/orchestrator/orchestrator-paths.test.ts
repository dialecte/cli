import { createHash } from 'node:crypto'
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { orchestratorPaths } from './orchestrator-paths.ts'

import { describe, expect, it } from 'vitest'

describe('orchestratorPaths', () => {
	const REFUSALS = {
		'relative XDG_STATE_HOME -> explicit refusal': {
			stateHome: 'state-home',
			message: 'XDG_STATE_HOME must be absolute: state-home',
		},
		'XDG_STATE_HOME inside the workspace -> explicit refusal': {
			stateHome: 'inside',
			message: 'XDG_STATE_HOME must be outside the workspace:',
		},
		'existing file selected as workspace -> explicit refusal': {
			stateHome: 'state-home',
			message: 'workspace must be a directory:',
			workspaceIsFile: true,
		},
	} as const

	it.each(Object.entries(REFUSALS))('%s', (_title, testCase) => {
		const root = temporaryFolder('dialecte-orchestrator-paths-refused-')
		const workspace = join(root, 'workspace')
		if ('workspaceIsFile' in testCase) writeFileSync(workspace, 'not a directory\n')
		else mkdirSync(workspace)
		const stateHome =
			testCase.stateHome === 'inside'
				? join(workspace, '.state')
				: 'workspaceIsFile' in testCase
					? join(root, testCase.stateHome)
					: testCase.stateHome

		expect(() =>
			orchestratorPaths({
				workspace,
				environment: { XDG_STATE_HOME: stateHome },
			}),
		).toThrowError(
			testCase.stateHome === 'inside'
				? `${testCase.message} ${stateHome}`
				: 'workspaceIsFile' in testCase
					? `${testCase.message} ${workspace}`
					: testCase.message,
		)
	})

	it('direct and symlink references to the same real workspace -> the same complete orchestrator paths', () => {
		const root = temporaryFolder('dialecte-orchestrator-paths-')
		const workspace = join(root, 'workspace')
		const linkedWorkspace = join(root, 'linked-workspace')
		const stateHome = join(root, 'state-home')
		mkdirSync(workspace)
		symlinkSync(workspace, linkedWorkspace, 'dir')

		const realWorkspace = realpathSync.native(workspace)
		const workspaceKey = `${basename(realWorkspace)}-${createHash('sha256')
			.update(realWorkspace)
			.digest('hex')
			.slice(0, 12)}`
		const folder = join(stateHome, 'dialecte', 'orchestrator', workspaceKey)
		const expected = {
			workspace: { root: realWorkspace, key: workspaceKey },
			folder,
			state: join(folder, 'state.json'),
			render: join(folder, 'STATE.md'),
			log: join(folder, 'log.jsonl'),
			runs: join(folder, 'runs'),
			reviews: join(folder, 'reviews'),
			answers: join(folder, 'answers'),
		}
		const references = [
			{ name: 'direct path', path: workspace },
			{ name: 'symlink', path: linkedWorkspace },
		]

		for (const reference of references) {
			expect(
				orchestratorPaths({
					workspace: reference.path,
					environment: { XDG_STATE_HOME: stateHome },
				}),
				reference.name,
			).toEqual(expected)
		}
	})
})
