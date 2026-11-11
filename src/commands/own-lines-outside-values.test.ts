/**
 * R2-1: a line the cli composes from an outside value (a path, an error message) prints an SGR or a line feed in it
 * escaped; the lines that relay a child's output keep the child's colour. One table per composing site.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { removeHookLogs } from '../../test/hook-logs.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { READ_LOT } from '../../test/scratch-checks.constants.ts'
import { editReadLot, writeHandoverFolder } from '../../test/scratch-checks.ts'
import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { LOCK_TEXT, POOL_REHEARSAL_CASE_MS } from '../../test/worktree-pool.constants.ts'
import { createFakeNodeModules, createRecordingSpawner } from '../../test/worktree-pool.ts'
import { runMergeLot } from '../lib/handover/merge-lot.ts'
import { linkRehearsalSiblings } from '../lib/handover/rehearsal-links.ts'
import { runHandoverRun } from './handover.ts'
import {
	CHILD_COLOUR_LINE,
	ENTRY_BOUND_MS,
	FORGED_COLOUR,
	FORGED_VALUES,
	NOT_PARKED_START,
	SCOPED_PACKAGE_FILES,
	TRASH_LINE_START,
	VITEST_WITH_COLOUR,
	WHOLE_SUITE_LINE_START,
} from './own-lines-outside-values.constants.ts'

import { describe, expect, it } from 'vitest'

import type { MergeLot } from '../lib/handover/handover.types.ts'

const SCOPED_TESTS_ENTRY = join(import.meta.dirname, '..', 'scoped-tests.ts')

/** The text no raw escape character may reach: every forged colour sequence must be written out. */
function holdsRawEscape(text: string): boolean {
	return text.includes(FORGED_COLOUR)
}

describe(
	'the whole-suite line of the scoped tests entry',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		for (const value of FORGED_VALUES)
			it(`a changed path holding ${value.title} -> the line prints it escaped; the child's colour line is kept`, () => {
				const root = initializeRepository({
					root: temporaryFolder('dialecte-own-lines-'),
					files: { ...SCOPED_PACKAGE_FILES, [`src/${value.forged}.md`]: 'a note\n' },
				})
				const binary = join(root, 'node_modules', '.bin', 'vitest')
				mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
				writeFileSync(binary, VITEST_WITH_COLOUR)
				chmodSync(binary, 0o755)
				const scope = temporaryFolder('dialecte-own-lines-scope-')
				writeFileSync(join(scope, 'changed'), `src/${value.forged}.md\0`)

				const run = spawnSync(process.execPath, [SCOPED_TESTS_ENTRY], {
					cwd: root,
					encoding: 'utf8',
					timeout: ENTRY_BOUND_MS,
					env: {
						...process.env,
						DIALECTE_GATE_BASE: 'a'.repeat(40),
						DIALECTE_GATE_TREE: 'b'.repeat(40),
						DIALECTE_GATE_CHANGED: join(scope, 'changed'),
						DIALECTE_GATE_SELECTION: join(scope, 'selection.json'),
					},
				})

				const lines = run.stdout.split('\n')
				const said = lines.filter((line) => line.startsWith(WHOLE_SUITE_LINE_START))
				expect(said).toHaveLength(1)
				expect(said[0]).toContain(value.escaped)
				expect(run.stdout.split(CHILD_COLOUR_LINE).length).toBeGreaterThan(1)
				expect(lines.some((line) => line === value.forged.split('\n')[1])).toBe(false)
			})
	},
)

describe('the rehearsal links lines', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	// a dependency spec cannot hold a line feed (the manifest's pattern stops at it): the colour form only
	for (const value of FORGED_VALUES.filter((each) => !each.forged.includes('\n')))
		it(`a local dependency path holding ${value.title} -> its lines print it escaped`, () => {
			const folder = temporaryFolder('dialecte-links-')
			const repository = join(folder, 'repo')
			const clone = join(folder, 'rehearsal', 'clone')
			mkdirSync(clone, { recursive: true })
			mkdirSync(repository, { recursive: true })
			// one dependency leaving the rehearsal folder, one missing inside it
			writeFileSync(
				join(repository, 'package.json'),
				JSON.stringify({
					name: 'demo',
					dependencies: {
						outside: `file:../../../${value.forged}`,
						missing: `file:../${value.forged}-missing`,
					},
				}),
			)

			const { lines } = linkRehearsalSiblings({
				repository,
				folder: join(folder, 'rehearsal'),
				clone,
			})

			expect(lines.length).toBeGreaterThan(0)
			expect(lines.join('\n')).toContain(value.escaped)
			expect(lines.every((line) => !line.includes(value.forged))).toBe(true)
		})
})

/** A repository with a branch whose tip merges cleanly, and the merge lot recording it. */
function mergeScenario(): { root: string; merge: MergeLot } {
	const root = initializeRepository({ root: temporaryFolder('dialecte-own-merge-') })
	git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })
	writeFiles({ root, files: { 'src/new.ts': 'export const n = 1\n' } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: x'] })
	const tip = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root, args: ['checkout', '-q', 'main'] })
	const onTree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
	return { root, merge: { branch: 'feat/x', tip, onTree, conflicts: [], resolutions: [] } }
}

describe('the merge lot refusal lines', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	for (const value of FORGED_VALUES) {
		it(`a reviewed conflict path holding ${value.title} -> the refusal's lines print it escaped`, () => {
			const { root, merge } = mergeScenario()

			const run = runMergeLot({ root, merge: { ...merge, conflicts: [`src/${value.forged}.ts`] } })

			expect('refusal' in run).toBe(true)
			const lines = 'lines' in run ? (run.lines ?? []) : []
			expect(lines.join('\n')).toContain(value.escaped)
			expect(lines.every((line) => !line.includes(value.forged))).toBe(true)
		})

		it(`a resolution path holding ${value.title} -> the refusal prints it escaped`, () => {
			const { root, merge } = mergeScenario()
			const missing = join(temporaryFolder('dialecte-own-resolution-'), 'resolution')

			const run = runMergeLot({
				root,
				merge: {
					...merge,
					resolutions: [{ path: `src/${value.forged}.ts`, file: missing, sha256: 'c'.repeat(64) }],
				},
			})

			const refusal = 'refusal' in run ? run.refusal : ''
			expect(refusal).toContain(value.escaped)
			expect(refusal).not.toContain(value.forged)
		})
	}
})

/** A workspace named `name` (real path) holding a repository with a node_modules and one lot, and its hand-over folder. */
function rehearsalScenario(name: string): { out: string } {
	const workspace = join(realpathSync(temporaryFolder('dialecte-own-rehearsal-')), name)
	const root = initializeRepository({
		root: join(workspace, 'repo'),
		files: {
			'.gitignore': 'node_modules\n',
			'package-lock.json': LOCK_TEXT,
			'src/read.ts': 'export function read() {}\n',
			'CHANGELOG.md': '# Changelog\n',
		},
	})
	createFakeNodeModules({ folder: join(root, 'node_modules'), marker: 'from the main checkout\n' })
	editReadLot(root)
	const { out } = writeHandoverFolder({ root, lots: [READ_LOT] })
	mkdirSync(join(workspace, '.worktrees'))
	return { out }
}

describe('the end of a rehearsal in a workspace', { timeout: POOL_REHEARSAL_CASE_MS }, () => {
	for (const value of FORGED_VALUES.filter((each) => !each.forged.includes('\n')))
		it(`a workspace folder holding ${value.title}, the park failing with a message holding it -> the trash and park lines print it escaped`, async () => {
			const { out } = rehearsalScenario(`ws-${value.forged}`)
			const lines: string[] = []
			removeHookLogs({ lines })
			const { spawner } = createRecordingSpawner()

			await runHandoverRun({
				probe: noRepositoryCli,
				argv: [out, '--rehearse'],
				write: (line) => lines.push(line),
				clock: createFakeClock(),
				colour: false,
				scratchRoot: realpathSync(temporaryFolder('dialecte-own-scratch-')),
				spawner,
				relink: function failing() {
					throw new Error(`relink failed ${value.forged}`)
				},
			})

			const ends = lines.filter(
				(line) => line.startsWith(NOT_PARKED_START) || line.startsWith(TRASH_LINE_START),
			)
			expect(ends.length).toBeGreaterThan(0)
			expect(ends.some((line) => holdsRawEscape(line))).toBe(false)
			expect(ends.join('\n')).toContain(value.escaped)
		})
})
