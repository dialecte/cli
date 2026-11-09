/** The key of a check: the tree, what npm installed, what ran, the linked folders; the hashes of what ran. */
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	SCRATCH_REPOSITORY_TIMEOUT,
	TREE_ID_PATTERN,
} from '../../../test/scratch-checks.constants.ts'
import { createHookedPackage, createCounter } from '../../../test/scratch-checks.ts'
import {
	createScratchRepository,
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { treeOfWorkingFiles } from '../../../test/scratch-tree.ts'
import { contribCommandHash } from '../contrib/contrib-key.ts'
import { computeCheckKey, hashGateCommand, hashHookCommand, readTreeOf } from './check-key.ts'
import { computeStateHash } from './state-hash.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../gate/gate-config.types.ts'
import type { CheckKey } from './gate-records.types.ts'

const SHA256_HEX = /^[0-9a-f]{64}$/

/** A command hash the key tests pass through: `computeCheckKey` only carries it. */
const COMMAND_HASH = 'c'.repeat(64)

/** A repository with a change of every kind: a modified, a new and a deleted file, an ignored one, a `.dialecte/` one. */
function changedRepository(): string {
	const root = createScratchRepository({
		'src/a.ts': 'export const a = 1\n',
		'src/gone.ts': 'export const gone = 1\n',
		'.gitignore': 'node_modules\n',
	})
	writeFiles({
		root,
		files: {
			'src/a.ts': 'export const a = 2\n',
			'src/new.ts': 'export const added = 1\n',
			'node_modules/ignored.js': 'ignored\n',
			'.dialecte/lot.json': '{}\n',
		},
	})
	rmSync(join(root, 'src/gone.ts'))
	return root
}

describe('computeCheckKey', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a worktree with a modified, a new and a deleted file → its tree is the one git write-tree gives for the same files staged in an index of its own', () => {
		const root = changedRepository()

		expect(computeCheckKey({ root, commandHash: COMMAND_HASH }).tree).toBe(treeOfWorkingFiles(root))
	})

	it('the same worktree → the tree is a git tree id, and its sha256 is the state hash the records already hold', () => {
		const root = changedRepository()

		expect(computeCheckKey({ root, commandHash: COMMAND_HASH }).tree).toMatch(TREE_ID_PATTERN)
		expect(
			createHash('sha256')
				.update(computeCheckKey({ root, commandHash: COMMAND_HASH }).tree)
				.digest('hex'),
		).toBe(computeStateHash(root))
	})

	it('a command hash given → carried in the key unchanged', () => {
		const root = changedRepository()

		expect(computeCheckKey({ root, commandHash: COMMAND_HASH }).commandHash).toBe(COMMAND_HASH)
	})

	it('a file changed in the worktree → another tree; the same files again → the same key', () => {
		const root = changedRepository()
		const before = treeOfWorkingFiles(root)
		writeFiles({ root, files: { 'src/a.ts': 'export const a = 3\n' } })
		const keys: CheckKey[] = []
		expect(keys.push(computeCheckKey({ root, commandHash: COMMAND_HASH }))).toBe(1)
		expect(keys.push(computeCheckKey({ root, commandHash: COMMAND_HASH }))).toBe(2)

		expect(keys[0].tree).not.toBe(before)
		expect(keys[1]).toEqual(keys[0])
	})

	it('no node_modules/.package-lock.json → lockHash is none', () => {
		const root = changedRepository()

		expect(computeCheckKey({ root, commandHash: COMMAND_HASH }).lockHash).toBe('none')
	})

	it('node_modules/.package-lock.json present → lockHash is the sha256 of its bytes, and another content gives another hash', () => {
		const root = changedRepository()
		const content = '{"packages":{"node_modules/a":{"version":"1.0.0"}}}\n'
		writeFiles({ root, files: { 'node_modules/.package-lock.json': content } })
		const locks: string[] = []
		expect(locks.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).lockHash)).toBe(1)
		writeFiles({
			root,
			files: { 'node_modules/.package-lock.json': content.replace('1.0.0', '1.0.1') },
		})
		expect(locks.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).lockHash)).toBe(2)

		expect(locks[0]).toBe(createHash('sha256').update(content).digest('hex'))
		expect(locks[1]).not.toBe(locks[0])
	})
})

/** An app (`file:../dep` in its devDependencies) and the dependency's folder, side by side. */
function linkedPair(): { root: string; dependency: string } {
	const container = temporaryFolder('dialecte-linked-')
	const root = initializeRepository({
		root: join(container, 'app'),
		files: {
			'package.json': `${JSON.stringify({ name: 'app', devDependencies: { dep: 'file:../dep' } })}\n`,
			'.gitignore': 'node_modules\n',
		},
	})
	const dependency = join(container, 'dep')
	writeFiles({
		root: dependency,
		files: {
			'package.json': `${JSON.stringify({ name: 'dep', files: ['lib', 'index.js'] })}\n`,
			'lib/a.js': 'one\n',
			'index.js': 'export {}\n',
			'node_modules/x/index.js': 'x\n',
		},
	})
	return { root, dependency }
}

describe(
	'computeCheckKey: the linked dependencies',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a file of the file: dependency changes size → linked changes', () => {
			const { root, dependency } = linkedPair()
			const linked: string[] = []
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(1)
			writeFiles({ root: dependency, files: { 'lib/a.js': 'one, and more\n' } })
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(2)

			expect(linked[1]).not.toBe(linked[0])
		})

		it('a file of the file: dependency changes its mtime only → linked changes', () => {
			const { root, dependency } = linkedPair()
			const linked: string[] = []
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(1)
			utimesSync(join(dependency, 'lib/a.js'), new Date('2030-01-01'), new Date('2030-01-01'))
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(2)

			expect(linked[1]).not.toBe(linked[0])
		})

		it("the dependency's node_modules changes → linked stays", () => {
			const { root, dependency } = linkedPair()
			const linked: string[] = []
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(1)
			writeFiles({
				root: dependency,
				files: { 'node_modules/x/index.js': 'x, changed and longer\n' },
			})
			writeFiles({ root: dependency, files: { 'node_modules/y/index.js': 'y\n' } })
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(2)

			expect(linked[1]).toBe(linked[0])
		})

		it('nothing changes → linked is a sha256 and stays the same from one call to the next', () => {
			const { root } = linkedPair()

			expect(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked).toMatch(SHA256_HEX)
			expect(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked).toBe(
				computeCheckKey({ root, commandHash: COMMAND_HASH }).linked,
			)
		})
	},
)

const STEPS: GateStep[] = [
	{ name: 'check', run: 'npm run check' },
	{ name: 'tests', run: 'npm run test:run', counts: 'tests' },
]

describe('hashGateCommand', () => {
	it('the same steps and no base twice → the same sha256', () => {
		expect(hashGateCommand({ steps: STEPS })).toMatch(SHA256_HEX)
		expect(hashGateCommand({ steps: STEPS })).toBe(hashGateCommand({ steps: [...STEPS] }))
	})

	const CHANGES: Record<string, { steps: GateStep[]; base?: string }> = {
		"a step's run changes": { steps: [{ ...STEPS[0], run: 'npm run check -- --fix' }, STEPS[1]] },
		"a step's name changes": { steps: [{ ...STEPS[0], name: 'checks' }, STEPS[1]] },
		'the steps change order': { steps: [STEPS[1], STEPS[0]] },
		'a step is added': { steps: [...STEPS, { name: 'build', run: 'npm run build' }] },
		'a base is given': { steps: STEPS, base: 'a'.repeat(40) },
	}

	for (const [name, changed] of Object.entries(CHANGES))
		it(`${name} → another hash`, () => {
			expect(hashGateCommand(changed)).not.toBe(hashGateCommand({ steps: STEPS }))
		})

	it('the same characters split between name and run differently, or between steps differently → another hash (no plain concatenation)', () => {
		expect(hashGateCommand({ steps: [{ name: 'a', run: 'bc' }] })).not.toBe(
			hashGateCommand({ steps: [{ name: 'ab', run: 'c' }] }),
		)
		expect(
			hashGateCommand({
				steps: [
					{ name: 'a', run: 'b' },
					{ name: 'c', run: 'd' },
				],
			}),
		).not.toBe(
			hashGateCommand({
				steps: [
					{ name: 'a', run: 'bc' },
					{ name: 'd', run: '' },
				],
			}),
		)
		expect(hashGateCommand({ steps: [{ name: 'a', run: 'b' }], base: 'c' })).not.toBe(
			hashGateCommand({ steps: [{ name: 'a', run: 'bc' }] }),
		)
	})

	it('another base → another hash; the same base twice → the same hash', () => {
		expect(hashGateCommand({ steps: STEPS, base: 'a'.repeat(40) })).not.toBe(
			hashGateCommand({ steps: STEPS, base: 'b'.repeat(40) }),
		)
		expect(hashGateCommand({ steps: STEPS, base: 'a'.repeat(40) })).toBe(
			hashGateCommand({ steps: STEPS, base: 'a'.repeat(40) }),
		)
	})
})

/** sha256 of main's `JSON.stringify({ steps: [[name, run]...], base })`, computed from main's function on fixed inputs. */
const GOLDEN_STEPS_NO_BASE = '03028b9eae699bdcbf4a275fa16aec5b04bd03d9e8b6afe7e095545d4c7e56ed'
const GOLDEN_STEPS_WITH_BASE = '9f20d598f338b3e1378ace0d7ef42266bdf01cb5eeb6e40daa281c9ab5dfe2d3'
const GOLDEN_CONTRIB_STEPS = [{ name: 'lint', run: 'npm run lint' }]
const GOLDEN_CONTRIB_HEAD = 'b'.repeat(40)
const GOLDEN_CONTRIB_HASH = '456e02d935847184dd75a959bf19abdd00a63135d2d15e12fd047ad0a05125a0'
const GOLDEN_HOOK_SCRIPT = '#!/bin/sh\nexit 0\n'
const GOLDEN_HOOK_HASH = 'fbf9f4d4d8fc6a63abbec90225742530f0c7f77db8abb99ed64592f34c92cd8f'
/** sha256 of `JSON.stringify({ steps: [["check","npm run check"],["tests","npm run test:run","scoped"]], base, gateBase })`, gateBase 'd' x 40. */
const GOLDEN_SCOPED_NO_BASE = '258c98b5f25d6932637fdb7b9f2d850233de64390ca3575d2bff4213c68dbf66'
const GOLDEN_SCOPED_WITH_BASE = 'd497f2b1738340d1372561046a239d255553f9cebdc9162c75312a605d339431'
const BASE = 'a'.repeat(40)
const GATE_BASE = 'd'.repeat(40)

describe('hashGateCommand with scoped and heavy steps', () => {
	const scopedTests: GateStep = { ...STEPS[1], scoped: true }

	it('steps without a scoped step → byte-identical to main: golden values, with and without a base', () => {
		expect(hashGateCommand({ steps: STEPS })).toBe(GOLDEN_STEPS_NO_BASE)
		expect(hashGateCommand({ steps: STEPS, base: BASE })).toBe(GOLDEN_STEPS_WITH_BASE)
	})

	it('heavy added or removed on a step → the hash is unchanged, with a scoped step beside it too', () => {
		const heavyStep: GateStep = { ...STEPS[0], heavy: true }
		const scopedSteps: GateStep[] = [STEPS[0], scopedTests]

		expect(hashGateCommand({ steps: [heavyStep, STEPS[1]] })).toBe(GOLDEN_STEPS_NO_BASE)
		expect(hashGateCommand({ steps: [heavyStep, STEPS[1]], base: BASE })).toBe(
			GOLDEN_STEPS_WITH_BASE,
		)
		expect(hashGateCommand({ steps: [heavyStep, scopedTests], gateBase: GATE_BASE })).toBe(
			hashGateCommand({ steps: scopedSteps, gateBase: GATE_BASE }),
		)
	})

	it('a step made scoped → another hash, with a gateBase given or not', () => {
		expect(hashGateCommand({ steps: [STEPS[0], scopedTests], gateBase: GATE_BASE })).not.toBe(
			hashGateCommand({ steps: STEPS, gateBase: GATE_BASE }),
		)
		expect(hashGateCommand({ steps: [STEPS[0], scopedTests] })).not.toBe(
			hashGateCommand({ steps: STEPS }),
		)
	})

	it('a scoped step → another gateBase gives another hash; the same one twice gives the same hash', () => {
		const steps = [STEPS[0], scopedTests]

		expect(hashGateCommand({ steps, gateBase: GATE_BASE })).not.toBe(
			hashGateCommand({ steps, gateBase: 'e'.repeat(40) }),
		)
		expect(hashGateCommand({ steps, gateBase: GATE_BASE })).toBe(
			hashGateCommand({ steps, gateBase: GATE_BASE }),
		)
	})

	it('no scoped step → a gateBase leaves the hash unchanged', () => {
		expect(hashGateCommand({ steps: STEPS, gateBase: GATE_BASE })).toBe(GOLDEN_STEPS_NO_BASE)
		expect(hashGateCommand({ steps: STEPS, base: BASE, gateBase: GATE_BASE })).toBe(
			GOLDEN_STEPS_WITH_BASE,
		)
	})

	it('a scoped step hashes as [name, run, "scoped"]: not as the same step without the mark, nor as another name or run', () => {
		const markedLikeAStep: GateStep = { name: STEPS[1].name, run: `${STEPS[1].run}scoped` }

		expect(hashGateCommand({ steps: [STEPS[0], scopedTests] })).not.toBe(GOLDEN_STEPS_NO_BASE)
		expect(hashGateCommand({ steps: [STEPS[0], scopedTests], gateBase: GATE_BASE })).not.toBe(
			hashGateCommand({ steps: [STEPS[0], markedLikeAStep], gateBase: GATE_BASE }),
		)
		expect(
			hashGateCommand({
				steps: [STEPS[0], { name: 'tests', run: 'npm run test:run', scoped: false }],
				gateBase: GATE_BASE,
			}),
		).toBe(GOLDEN_STEPS_NO_BASE)
	})

	it('a scoped step → the golden hash of spec section 8: steps, then base ?? null, then gateBase', () => {
		const steps = [STEPS[0], scopedTests]

		expect(hashGateCommand({ steps, gateBase: GATE_BASE })).toBe(GOLDEN_SCOPED_NO_BASE)
		expect(hashGateCommand({ steps, base: BASE, gateBase: GATE_BASE })).toBe(
			GOLDEN_SCOPED_WITH_BASE,
		)
	})

	it('a scoped step, another base → another hash; the same base twice → the same hash', () => {
		const steps = [STEPS[0], scopedTests]

		expect(hashGateCommand({ steps, base: BASE, gateBase: GATE_BASE })).not.toBe(
			hashGateCommand({ steps, base: 'f'.repeat(40), gateBase: GATE_BASE }),
		)
		expect(hashGateCommand({ steps, base: BASE, gateBase: GATE_BASE })).not.toBe(
			hashGateCommand({ steps, gateBase: GATE_BASE }),
		)
	})

	it('a changedOnly step beside a scoped one → the base (HEAD) is still in the hash', () => {
		const steps: GateStep[] = [{ ...STEPS[0], changedOnly: true }, scopedTests]

		expect(hashGateCommand({ steps, base: BASE, gateBase: GATE_BASE })).not.toBe(
			hashGateCommand({ steps, base: 'f'.repeat(40), gateBase: GATE_BASE }),
		)
		expect(hashGateCommand({ steps, base: BASE, gateBase: GATE_BASE })).toBe(
			GOLDEN_SCOPED_WITH_BASE,
		)
	})
})

describe('contribCommandHash', () => {
	it('fixed contrib rows and head → the golden hash of main (unchanged by this lot)', () => {
		expect(contribCommandHash({ steps: GOLDEN_CONTRIB_STEPS, head: GOLDEN_CONTRIB_HEAD })).toBe(
			GOLDEN_CONTRIB_HASH,
		)
	})
})

describe('hashHookCommand golden', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a repository whose only commit hook is a fixed pre-commit → the golden hash of main (unchanged by this lot)', () => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
		const hook = join(root, '.git/hooks/pre-commit')
		mkdirSync(join(root, '.git/hooks'), { recursive: true })
		writeFileSync(hook, GOLDEN_HOOK_SCRIPT)
		chmodSync(hook, 0o755)

		expect(hashHookCommand(root)).toBe(GOLDEN_HOOK_HASH)
	})
})

describe('hashHookCommand', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the husky pre-commit script changes → another hash; the same files twice → the same sha256', () => {
		const root = createHookedPackage({ hookCounter: createCounter(), gateCounter: createCounter() })
		const hashes: string[] = []
		expect(hashes.push(hashHookCommand(root))).toBe(1)
		expect(hashes.push(hashHookCommand(root))).toBe(2)
		writeFiles({ root, files: { '.husky/pre-commit': 'echo a different hook\n' } })
		expect(hashes.push(hashHookCommand(root))).toBe(3)

		expect(hashes[0]).toMatch(SHA256_HEX)
		expect(hashes[1]).toBe(hashes[0])
		expect(hashes[2]).not.toBe(hashes[0])
	})

	it("no husky: the hooks folder's executable pre-commit changes → another hash", () => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
		const hook = join(root, '.git/hooks/pre-commit')
		mkdirSync(join(root, '.git/hooks'), { recursive: true })
		writeFileSync(hook, '#!/bin/sh\nexit 0\n')
		chmodSync(hook, 0o755)
		const hashes: string[] = []
		expect(hashes.push(hashHookCommand(root))).toBe(1)
		writeFileSync(hook, '#!/bin/sh\necho changed\nexit 0\n')
		expect(hashes.push(hashHookCommand(root))).toBe(2)

		expect(hashes[0]).toMatch(SHA256_HEX)
		expect(hashes[1]).not.toBe(hashes[0])
	})
})

describe('readTreeOf', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it("a commit, named by HEAD, a branch or its sha → that commit's tree", () => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
		git({ root, args: ['branch', 'other'] })
		const sha = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		const tree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()

		expect(readTreeOf({ root, revision: 'HEAD' })).toBe(tree)
		expect(readTreeOf({ root, revision: 'other' })).toBe(tree)
		expect(readTreeOf({ root, revision: sha })).toBe(tree)
	})

	it('two commits holding other files → two trees', () => {
		const root = createScratchRepository({ 'src/a.ts': 'export {}\n' })
		const first = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		writeFiles({ root, files: { 'src/b.ts': 'export {}\n' } })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: b'] })

		expect(readTreeOf({ root, revision: 'HEAD' })).not.toBe(readTreeOf({ root, revision: first }))
	})
})

describe(
	'computeCheckKey: what the linked dependency really is',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the spec path does not exist but node_modules/<name> links to a folder → a change in that folder changes linked', () => {
			const container = temporaryFolder('dialecte-linked-')
			const root = initializeRepository({
				root: join(container, 'app'),
				files: {
					'package.json': `${JSON.stringify({ name: 'app', devDependencies: { dep: 'file:../missing' } })}\n`,
					'.gitignore': 'node_modules\n',
				},
			})
			const installed = join(container, 'installed')
			writeFiles({
				root: installed,
				files: {
					'package.json': `${JSON.stringify({ name: 'dep', files: ['lib'] })}\n`,
					'lib/a.js': 'one\n',
				},
			})
			mkdirSync(join(root, 'node_modules'), { recursive: true })
			symlinkSync(installed, join(root, 'node_modules', 'dep'))
			const linked: string[] = []
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(1)
			writeFiles({ root: installed, files: { 'lib/a.js': 'one, and more\n' } })
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(2)

			expect(linked[1]).not.toBe(linked[0])
		})

		it("files outside the dependency's package files (an untracked .tmp log, a .cache folder, a source) change nothing; a change in a published path or in its package.json changes linked", () => {
			const { root, dependency } = linkedPair()
			writeFiles({
				root: dependency,
				files: { 'src/b.js': 'source\n', '.tmp/x.log': 'log\n', '.cache/y': 'cache\n' },
			})
			const linked: string[] = []
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(1)
			writeFiles({
				root: dependency,
				files: {
					'.tmp/x.log': 'a longer log line\n',
					'.cache/y': 'cache, grown\n',
					'.cache/z': 'new\n',
					'src/b.js': 'source, edited and longer\n',
				},
			})
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(2)
			writeFiles({ root: dependency, files: { 'lib/a.js': 'published, edited\n' } })
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(3)
			writeFiles({
				root: dependency,
				files: {
					'package.json': `${JSON.stringify({ name: 'dep', version: '2.0.0', files: ['lib', 'index.js'] })}\n`,
				},
			})
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(4)

			expect(linked[1]).toBe(linked[0])
			expect(linked[2]).not.toBe(linked[1])
			expect(linked[3]).not.toBe(linked[2])
		})
	},
)

describe(
	'computeCheckKey: a dependency with the files list of core',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		/** An app linking `../dep`, whose package.json lists `files` as core does: published folders and an exclusion. */
		function coreShapedPair(): { root: string; dependency: string } {
			const container = temporaryFolder('dialecte-linked-')
			const root = initializeRepository({
				root: join(container, 'app'),
				files: {
					'package.json': `${JSON.stringify({ name: 'app', devDependencies: { dep: 'file:../dep' } })}\n`,
					'.gitignore': 'node_modules\n',
				},
			})
			const dependency = join(container, 'dep')
			writeFiles({
				root: dependency,
				files: {
					'package.json': `${JSON.stringify({ name: 'dep', files: ['dist', 'skills', '!skills/*/evals', 'bin'] })}\n`,
					'dist/a.js': 'built\n',
					'skills/s/SKILL.md': 'skill\n',
					'skills/s/evals/e.md': 'eval\n',
					'bin/run.js': 'bin\n',
					'.tmp/x.log': 'log\n',
					'.claude/c.json': '{}\n',
					'.worktrees/x/file': 'nested\n',
				},
			})
			return { root, dependency }
		}

		it('a write to an unpublished .tmp log, .claude or a nested .worktrees folder → linked stays; a write to dist/, skills/ or bin/ → it changes each time', () => {
			const { root, dependency } = coreShapedPair()
			const linked: string[] = []
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(1)
			writeFiles({
				root: dependency,
				files: {
					'.tmp/x.log': 'a much longer log line than before\n',
					'.tmp/y.log': 'new\n',
					'.claude/c.json': '{"changed":true}\n',
					'.worktrees/x/file': 'nested, edited and longer\n',
				},
			})
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(2)
			writeFiles({ root: dependency, files: { 'dist/a.js': 'built again\n' } })
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(3)
			writeFiles({ root: dependency, files: { 'skills/s/SKILL.md': 'skill, edited\n' } })
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(4)
			writeFiles({ root: dependency, files: { 'bin/run.js': 'bin, edited\n' } })
			expect(linked.push(computeCheckKey({ root, commandHash: COMMAND_HASH }).linked)).toBe(5)

			expect(linked[1]).toBe(linked[0])
			expect(new Set(linked.slice(1)).size).toBe(4)
		})
	},
)
