import { createHash } from 'node:crypto'
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { orchestratorPaths } from './orchestrator-paths.ts'

import { describe, expect, it } from 'vitest'

import type { OrchestratorPathsParams } from './orchestrator.types.ts'

type PathsOutcome = { paths: unknown } | { refusal: string }

/** The paths, or the refusal message (so a refusal or a missing refusal fails on the assertion). */
function pathsOutcome(params: OrchestratorPathsParams): PathsOutcome {
	try {
		return { paths: orchestratorPaths(params) }
	} catch (error) {
		return { refusal: error instanceof Error ? error.message : String(error) }
	}
}

/** The exact paths below `stateHome` for the real workspace `root`: the folder and its three files, nothing more. */
function expectedPaths(params: { root: string; stateHome: string }): unknown {
	const key = `${basename(params.root)}-${createHash('sha256')
		.update(params.root)
		.digest('hex')
		.slice(0, 12)}`
	const folder = join(params.stateHome, 'dialecte', 'orchestrator', key)
	return {
		workspace: { root: params.root, key },
		folder,
		state: join(folder, 'state.json'),
		render: join(folder, 'STATE.md'),
		log: join(folder, 'log.jsonl'),
	}
}

/** A temporary root holding an empty `workspace` folder, with its real path. */
function workspaceCase(prefix: string): { root: string; workspace: string; realWorkspace: string } {
	const root = temporaryFolder(prefix)
	const workspace = join(root, 'workspace')
	mkdirSync(workspace)
	return { root, workspace, realWorkspace: realpathSync.native(workspace) }
}

describe('orchestratorPaths, the state home', function orchestratorpathsTheStateHome() {
	const CASES: Record<string, () => void> = {
		'relative XDG_STATE_HOME -> ignored as unset: the folder below <home>/.local/state of the given home':
			function relativeXdgStateHomeIgnored() {
				const { root, workspace, realWorkspace } = workspaceCase('dialecte-orchestrator-paths-')
				const home = join(root, 'home')

				expect(
					pathsOutcome({ workspace, environment: { XDG_STATE_HOME: 'state-home' }, home }),
				).toEqual({
					paths: expectedPaths({ root: realWorkspace, stateHome: join(home, '.local', 'state') }),
				})
			},
		'XDG_STATE_HOME inside the workspace -> refused naming the state home, XDG_STATE_HOME as its origin and the workspace':
			function xdgStateHomeInsideThe() {
				const { root, workspace, realWorkspace } = workspaceCase('dialecte-orchestrator-paths-')
				const stateHome = join(workspace, '.state')

				expect(
					pathsOutcome({
						workspace,
						environment: { XDG_STATE_HOME: stateHome },
						home: join(root, 'home'),
					}),
				).toEqual({
					refusal: `state home ${stateHome} (from XDG_STATE_HOME) must be outside the workspace ${realWorkspace}`,
				})
			},
		'XDG_STATE_HOME unset and the home inside the workspace -> refused naming <home>/.local/state as the origin, never XDG_STATE_HOME':
			function xdgStateHomeUnsetAnd() {
				const { workspace, realWorkspace } = workspaceCase('dialecte-orchestrator-paths-')
				const home = join(workspace, 'home')
				const stateHome = join(home, '.local', 'state')

				expect(pathsOutcome({ workspace, environment: {}, home })).toEqual({
					refusal: `state home ${stateHome} (from <home>/.local/state) must be outside the workspace ${realWorkspace}`,
				})
			},
		'relative XDG_STATE_HOME and the home inside the workspace -> the ignored value is not mentioned, <home>/.local/state is the origin':
			function relativeXdgStateHomeAnd() {
				const { workspace, realWorkspace } = workspaceCase('dialecte-orchestrator-paths-')
				const home = join(workspace, 'home')
				const stateHome = join(home, '.local', 'state')

				expect(
					pathsOutcome({ workspace, environment: { XDG_STATE_HOME: 'state-home' }, home }),
				).toEqual({
					refusal: `state home ${stateHome} (from <home>/.local/state) must be outside the workspace ${realWorkspace}`,
				})
			},
		'a folder named ..state inside the workspace as XDG_STATE_HOME -> inside, refused (its first segment is not ..)':
			function aFolderNamedStateInside() {
				const { root, workspace, realWorkspace } = workspaceCase('dialecte-orchestrator-paths-')
				const stateHome = join(workspace, '..state')

				expect(
					pathsOutcome({
						workspace,
						environment: { XDG_STATE_HOME: stateHome },
						home: join(root, 'home'),
					}),
				).toEqual({
					refusal: `state home ${stateHome} (from XDG_STATE_HOME) must be outside the workspace ${realWorkspace}`,
				})
			},
		'a sibling named ..state beside the workspace as XDG_STATE_HOME -> outside, accepted, the exact paths below it':
			function aSiblingNamedStateBeside() {
				const { root, workspace, realWorkspace } = workspaceCase('dialecte-orchestrator-paths-')
				const stateHome = join(dirname(workspace), '..state')

				expect(
					pathsOutcome({
						workspace,
						environment: { XDG_STATE_HOME: stateHome },
						home: join(root, 'home'),
					}),
				).toEqual({ paths: expectedPaths({ root: realWorkspace, stateHome }) })
			},
		'XDG_STATE_HOME below a regular file -> refused naming the state home, its origin and the errno code':
			function stateHomeBelowFile() {
				const { root, workspace } = workspaceCase('dialecte-orchestrator-paths-')
				const file = join(root, 'file')
				writeFileSync(file, 'not a folder\n')
				const stateHome = join(file, 'state')

				expect(
					pathsOutcome({
						workspace,
						environment: { XDG_STATE_HOME: stateHome },
						home: join(root, 'home'),
					}),
				).toEqual({
					refusal: `state home ${stateHome} (from XDG_STATE_HOME) cannot be read: ENOTDIR`,
				})
			},
		'existing file selected as workspace -> explicit refusal naming it':
			function existingFileSelectedAsWorkspace() {
				const root = temporaryFolder('dialecte-orchestrator-paths-refused-')
				const workspace = join(root, 'workspace')
				writeFileSync(workspace, 'not a directory\n')

				expect(
					pathsOutcome({
						workspace,
						environment: { XDG_STATE_HOME: join(root, 'state-home') },
						home: join(root, 'home'),
					}),
				).toEqual({ refusal: `workspace must be a directory: ${workspace}` })
			},
		'direct and symlink references to the same real workspace -> the same paths, exactly workspace, folder, state, render and log':
			function directAndSymlinkReferencesTo() {
				const { root, workspace, realWorkspace } = workspaceCase('dialecte-orchestrator-paths-')
				const linkedWorkspace = join(root, 'linked-workspace')
				const stateHome = join(root, 'state-home')
				symlinkSync(workspace, linkedWorkspace, 'dir')
				const expected = { paths: expectedPaths({ root: realWorkspace, stateHome }) }

				for (const reference of [workspace, linkedWorkspace])
					expect(
						pathsOutcome({
							workspace: reference,
							environment: { XDG_STATE_HOME: stateHome },
							home: join(root, 'home'),
						}),
						reference,
					).toEqual(expected)
			},
	}

	it.each(Object.entries(CASES))('%s', function runsCase(_title, run) {
		run()
	})
})
