/**
 * `readModeCommandHashes`: the hashes a record of each mode must hold, read at the worktree's own files, or at the
 * tree it is given (the hook files and the package.json as that tree holds them).
 */
import { chmodSync } from 'node:fs'
import { join } from 'node:path'

import { hookRecordsOf, runHookIn } from '../../../test/gate-hook.ts'
import {
	COMMIT_MSG_FILE,
	GITHOOKS_FOLDER,
	GITHOOKS_PRE_COMMIT_FILE,
	HOOK_TREE_STEPS,
	MAIN_PRE_COMMIT,
	OTHER_HOOK_TREE_STEPS,
	PRE_COMMIT_NAME,
} from '../../../test/hook-tree.constants.ts'
import {
	createGithooksRepository,
	createHookTreeRepository,
	packageJsonOf,
	preCommitTextOf,
} from '../../../test/hook-tree.ts'
import { GATE_HOOK_SCRIPT } from '../../../test/scoped-hook-package.constants.ts'
import { createTwoIdsStep, createScopedHookedPackage } from '../../../test/scoped-hook-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { resolveConfiguredBase } from '../gate/gate-base.ts'
import { resolveGateSteps } from '../gate/gate-config.ts'
import { readPackageJson } from '../package-json.ts'
import { gateCommandHash, hashHookCommand } from './check-key.ts'
import { readModeCommandHashes } from './mode-command-hashes.ts'

import { describe, expect, it } from 'vitest'

describe(
	'readModeCommandHashes: the tree the hashes are read at',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the worktree’s own tree, and no tree → the same hashes, the hook-gate hash the key a gate --hook run records', async () => {
			const { root, ownTree } = createHookTreeRepository()
			const packageJson = readPackageJson(root)
			const ran = await runHookIn({ cwd: root })
			expect(ran.exitCode).toBe(0)
			const [record] = hookRecordsOf({ root, tree: ownTree })

			const withTree = readModeCommandHashes({ root, packageJson, tree: ownTree })
			const withoutTree = readModeCommandHashes({ root, packageJson })

			expect({ withTree, hookGate: withoutTree.hookGate }).toEqual({
				withTree: withoutTree,
				hookGate: record.key?.commandHash,
			})
		})

		it('a scoped hook step, the hook run at its own base → the hook-gate hash read at the base the hook resolved (the base branch’s merge-base) is the key the hook recorded', async () => {
			const { step } = createTwoIdsStep()
			const root = createScopedHookedPackage({
				gate: { fast: [step], full: [step] },
				hookScript: GATE_HOOK_SCRIPT,
				onFeatureBranch: true,
			})
			const ran = await runHookIn({ cwd: root })
			expect(ran.exitCode).toBe(0)
			const tree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
			const [record] = hookRecordsOf({ root, tree })
			const packageJson = readPackageJson(root)
			const base = resolveConfiguredBase({ root, packageJson })

			const hashes = readModeCommandHashes({
				root,
				packageJson,
				gateBase: base !== undefined && 'commit' in base ? base.commit : undefined,
				tree,
			})

			expect(hashes.hookGate).toBe(record.key?.commandHash)
		})

		it('a hooks folder outside the repository, with a tree and without → the hook hash read from disk either way', () => {
			const { root, ownTree } = createHookTreeRepository()
			const folder = temporaryFolder('dialecte-hooks-')
			writeFiles({ root: folder, files: { [PRE_COMMIT_NAME]: preCommitTextOf(MAIN_PRE_COMMIT) } })
			chmodSync(join(folder, PRE_COMMIT_NAME), 0o755)
			git({ root, args: ['config', 'core.hooksPath', folder] })
			const packageJson = readPackageJson(root)

			const withTree = readModeCommandHashes({ root, packageJson, tree: ownTree })
			const withoutTree = readModeCommandHashes({ root, packageJson })

			expect({ withTree: withTree.hook, withoutTree: withoutTree.hook }).toEqual({
				withTree: hashHookCommand(root),
				withoutTree: hashHookCommand(root),
			})
		})

		it('a hooks folder inside the work tree that git ignores, with a tree → the hook hash read from disk, the hash a commit keys its hook record with', () => {
			const root = createScratchRepository({
				'package.json': packageJsonOf(HOOK_TREE_STEPS),
				'.gitignore': `node_modules\n${GITHOOKS_FOLDER}/\n`,
			})
			writeFiles({ root, files: { [GITHOOKS_PRE_COMMIT_FILE]: preCommitTextOf(MAIN_PRE_COMMIT) } })
			chmodSync(join(root, GITHOOKS_PRE_COMMIT_FILE), 0o755)
			git({ root, args: ['config', 'core.hooksPath', GITHOOKS_FOLDER] })
			const tree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()

			const hashes = readModeCommandHashes({ root, packageJson: readPackageJson(root), tree })

			expect(hashes.hook).toBe(hashHookCommand(root))
		})

		it('main adds a hook file the worktree lacks → the hash read at the merged tree includes it, equal to hashHookCommand after the merge', () => {
			const { root, tip, mergedTree } = createHookTreeRepository({
				branchFiles: { [COMMIT_MSG_FILE]: preCommitTextOf(MAIN_PRE_COMMIT) },
			})

			const hashes = readModeCommandHashes({
				root,
				packageJson: readPackageJson(root),
				tree: mergedTree,
			})
			git({ root, args: ['merge', '-q', '--no-verify', '--no-edit', tip] })

			expect(hashes.hook).toBe(hashHookCommand(root))
		})

		it('the tree a merge leaves, whose pre-commit differs from the worktree’s → the hook hash is the hash of the files as that tree holds them', () => {
			const { root, mergedTree, mergedHookHash } = createHookTreeRepository()

			const hashes = readModeCommandHashes({
				root,
				packageJson: readPackageJson(root),
				tree: mergedTree,
			})

			expect(hashes.hook).toBe(mergedHookHash)
		})

		it('a hooks folder inside the repository, its file differing between the worktree and the merged tree → the hook hash is that of the merged tree’s file', () => {
			const { root, mergedTree, mergedHookHash } = createGithooksRepository()

			const hashes = readModeCommandHashes({
				root,
				packageJson: readPackageJson(root),
				tree: mergedTree,
			})

			expect(hashes.hook).toBe(mergedHookHash)
		})

		it('the tree a merge leaves, whose package.json holds another full gate → the full hash is that of that gate’s steps', () => {
			const { root, mergedTree } = createHookTreeRepository({
				branchFiles: { 'package.json': packageJsonOf(OTHER_HOOK_TREE_STEPS) },
			})
			const mergedPackageJson = JSON.parse(packageJsonOf(OTHER_HOOK_TREE_STEPS))

			const hashes = readModeCommandHashes({
				root,
				packageJson: readPackageJson(root),
				tree: mergedTree,
			})

			expect(hashes.full).toBe(
				gateCommandHash({
					root,
					steps: resolveGateSteps({ packageJson: mergedPackageJson, mode: 'full' }),
				}),
			)
		})
	},
)
