import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { INSTALL_ARGS } from '../../../test/bench-repository.constants.ts'
import { lockOf } from '../../../test/bench-repository.ts'
import { commitFiles } from '../../../test/rules-lot-worktree.ts'
import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { SCRATCH_VARIABLE } from '../scratch/scratch.constants.ts'
import { materializeBaseTree, removeBaseTree } from './base-tree.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NpmRunner } from '../worktree/worktree.types.ts'
import type { BaseTree } from './base-tree.types.ts'

const SCRATCH_PURPOSE = 'bench-base'
const PACKAGE_FOLDER = 'demo'
const SIBLING_FILE = 'index.js'
const NPM_FAILURE = ['npm ERR! code E404', 'npm ERR! 404 Not Found - left-pad@2.0.0', ''].join('\n')

function packageJsonOf(dependencies: Record<string, string>): string {
	return `${JSON.stringify({ name: 'demo', dependencies })}\n`
}

type Fixture = { root: string; base: string; sibling: string; scratch: string }

/**
 * `<workspace>/demo`, a repository whose base commit holds `baseDependencies` and a lock installing left-pad at the version `baseLock`, and whose
 * HEAD holds `headDependencies`, left-pad 1.0.0's lock and a change of its own, installed in its `node_modules`; `<workspace>/sibling`
 * beside it; the scratch root the test's own.
 */
function createFixture(params: {
	/** The left-pad version the base's lock installs. */
	baseLock: string
	baseDependencies?: Record<string, string>
	headDependencies?: Record<string, string>
}): Fixture {
	const workspace = temporaryFolder('dialecte-bench-base-')
	const sibling = join(workspace, 'sibling')
	writeFiles({ root: sibling, files: { [SIBLING_FILE]: 'module.exports = 1\n' } })
	const root = initializeRepository({
		root: join(workspace, PACKAGE_FOLDER),
		files: {
			'package.json': packageJsonOf(params.baseDependencies ?? {}),
			'package-lock.json': lockOf(params.baseLock),
			'.gitignore': 'node_modules\n',
			'src/a.ts': 'export {}\n',
		},
	})
	const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	commitFiles({
		root,
		files: {
			'package.json': packageJsonOf(params.headDependencies ?? {}),
			'package-lock.json': lockOf('1.0.0'),
			'src/a.ts': 'export const head = 1\n',
		},
		message: 'chore: the head',
	})
	writeFiles({
		root,
		files: {
			'node_modules/left-pad/package.json': `${JSON.stringify({ name: 'left-pad', version: '1.0.0' })}\n`,
		},
	})
	const scratch = temporaryFolder('dialecte-bench-scratch-')
	vi.stubEnv(SCRATCH_VARIABLE, scratch)
	return { root, base, sibling, scratch }
}

/** An installer that records where it ran, with what, and whether the sibling link was there; answers `status`. */
function recordingInstaller(params: { status: number; output: string }): {
	install: NpmRunner
	calls: { checkout: string; args: string[]; siblingLinked: boolean }[]
} {
	const calls: { checkout: string; args: string[]; siblingLinked: boolean }[] = []
	return {
		calls,
		install: function recordInstall({ checkout, args }) {
			calls.push({ checkout, args, siblingLinked: existsSync(join(dirname(checkout), 'sibling')) })
			return { status: params.status, output: params.output }
		},
	}
}

function benchBaseFoldersIn(scratch: string): string[] {
	return readdirSync(scratch).filter((name) => name.startsWith(SCRATCH_PURPOSE))
}

function treeOf(answer: BaseTree | { refusal: string }): BaseTree {
	if ('refusal' in answer) throw new Error(`refused: ${answer.refusal}`)
	return answer
}

/** The base tree's `node_modules`: whether it is a link, and the real folder it is. */
function nodeModulesOf(answer: BaseTree | { refusal: string }): { link: boolean; real: string } {
	const nodeModules = join(treeOf(answer).folder, 'node_modules')
	return { link: lstatSync(nodeModules).isSymbolicLink(), real: realpathSync(nodeModules) }
}

/** The real folder the base tree's `sibling` link reaches. */
function siblingOf(answer: BaseTree | { refusal: string }): string {
	return realpathSync(join(dirname(treeOf(answer).folder), 'sibling'))
}

afterEach(() => {
	vi.unstubAllEnvs()
})

describe(
	'materializeBaseTree: the package at the base commit, beside the head',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it("the head's install matches the base's lock → node_modules is a link to the head's, the installer is not called", () => {
			const fixture = createFixture({ baseLock: '1.0.0' })
			const installer = recordingInstaller({ status: 0, output: '' })

			expect({
				nodeModules: nodeModulesOf(
					materializeBaseTree({
						root: fixture.root,
						commit: fixture.base,
						install: installer.install,
					}),
				),
				calls: installer.calls,
			}).toEqual({
				nodeModules: { link: true, real: realpathSync(join(fixture.root, 'node_modules')) },
				calls: [],
			})
		})

		it("the base's lock installs other packages → the installer runs in the base tree, after the sibling links exist", () => {
			const fixture = createFixture({
				baseLock: '2.0.0',
				baseDependencies: { sibling: 'file:../sibling' },
			})
			const installer = recordingInstaller({ status: 0, output: '' })

			expect({
				folder: treeOf(
					materializeBaseTree({
						root: fixture.root,
						commit: fixture.base,
						install: installer.install,
					}),
				).folder,
				calls: installer.calls,
			}).toEqual({
				folder: expect.stringMatching(new RegExp(`/${SCRATCH_PURPOSE}[^/]+/${PACKAGE_FOLDER}$`)),
				calls: [
					{
						checkout: expect.stringMatching(
							new RegExp(`/${SCRATCH_PURPOSE}[^/]+/${PACKAGE_FOLDER}$`),
						),
						args: INSTALL_ARGS,
						siblingLinked: true,
					},
				],
			})
		})

		it('the installer fails → a refusal with its last line; the scratch folder is gone', () => {
			const fixture = createFixture({ baseLock: '2.0.0' })
			const installer = recordingInstaller({ status: 1, output: NPM_FAILURE })

			expect({
				answer: materializeBaseTree({
					root: fixture.root,
					commit: fixture.base,
					install: installer.install,
				}),
				left: benchBaseFoldersIn(fixture.scratch),
			}).toEqual({
				answer: { refusal: expect.stringContaining('npm ERR! 404 Not Found - left-pad@2.0.0') },
				left: [],
			})
		})

		it('removed after use → the scratch folder is gone, the links unlinked, their targets intact, no worktree registered', () => {
			const fixture = createFixture({
				baseLock: '1.0.0',
				baseDependencies: { sibling: 'file:../sibling' },
			})
			const worktreesBefore = git({ root: fixture.root, args: ['worktree', 'list'] })

			/** The base tree removed, then what is left of it. */
			function leftAfterRemoval(answer: BaseTree | { refusal: string }): Record<string, unknown> {
				const tree = treeOf(answer)
				const link = join(dirname(tree.folder), 'sibling')
				removeBaseTree(tree)
				return {
					left: benchBaseFoldersIn(fixture.scratch),
					linkPresent: existsSync(link),
					siblingIntact: existsSync(join(fixture.sibling, SIBLING_FILE)),
					worktrees: git({ root: fixture.root, args: ['worktree', 'list'] }),
				}
			}

			expect(
				leftAfterRemoval(materializeBaseTree({ root: fixture.root, commit: fixture.base })),
			).toEqual({ left: [], linkPresent: false, siblingIntact: true, worktrees: worktreesBefore })
		})

		const siblingCases: Record<
			string,
			{ baseDependencies: Record<string, string>; headDependencies: Record<string, string> }
		> = {
			'a file:../sibling dependency of both → linked beside the base tree': {
				baseDependencies: { sibling: 'file:../sibling' },
				headDependencies: { sibling: 'file:../sibling' },
			},
			"a file:../sibling dependency only the base's package.json has → linked too": {
				baseDependencies: { sibling: 'file:../sibling' },
				headDependencies: {},
			},
		}
		for (const [title, siblingCase] of Object.entries(siblingCases))
			it(title, () => {
				const fixture = createFixture({ baseLock: '1.0.0', ...siblingCase })

				expect(siblingOf(materializeBaseTree({ root: fixture.root, commit: fixture.base }))).toBe(
					realpathSync(fixture.sibling),
				)
			})

		it('a sibling dependency whose folder is missing → a refusal naming it; the scratch folder is gone', () => {
			const fixture = createFixture({
				baseLock: '1.0.0',
				baseDependencies: { absent: 'file:../absent' },
			})

			expect({
				answer: materializeBaseTree({ root: fixture.root, commit: fixture.base }),
				left: benchBaseFoldersIn(fixture.scratch),
			}).toEqual({ answer: { refusal: expect.stringContaining('absent') }, left: [] })
		})

		it('a commit git cannot export → a refusal; the scratch folder is gone', () => {
			const fixture = createFixture({ baseLock: '1.0.0' })

			expect({
				answer: materializeBaseTree({ root: fixture.root, commit: 'a'.repeat(40) }),
				left: benchBaseFoldersIn(fixture.scratch),
			}).toEqual({ answer: { refusal: expect.any(String) }, left: [] })
		})
	},
)
