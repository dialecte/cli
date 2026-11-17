/**
 * `lot start` and its dry run print whether the lot needs a design, before any code (DESIGN-GATE section 1): the
 * reasons and what to record when it does.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createStartWorkspace, withLines } from '../../test/lot-start-workspace.ts'
import { START_NOW } from '../../test/lot-start.constants.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const DECLARED = 'src/dataflow/**'
const REQUIRED_LINE = `design required (shared ${DECLARED}): write it, then dialecte lot design <id> --from <file>`

/**
 * A start workspace whose brief's base is a commit declaring `DECLARED` a shared area, while the main checkout's
 * working `package.json` no longer declares it.
 */
function baseDeclaringStart(): ReturnType<typeof createStartWorkspace> {
	const start = createStartWorkspace()
	const { repository, briefPath } = start.workspace
	const declaring = { name: 'scratch', dialecte: { risk: { high: [DECLARED] } } }
	writeFileSync(join(repository, 'package.json'), `${JSON.stringify(declaring)}\n`)
	git({ root: repository, args: ['add', 'package.json'] })
	git({ root: repository, args: ['commit', '-qm', 'chore: declare the shared area'] })
	const base = git({ root: repository, args: ['rev-parse', 'HEAD'] }).trim()
	const brief = JSON.parse(readFileSync(briefPath, 'utf8')) as Record<string, unknown>
	writeFileSync(briefPath, `${JSON.stringify({ ...brief, base })}\n`)
	writeFileSync(join(repository, 'package.json'), `${JSON.stringify({ name: 'scratch' })}\n`)
	return start
}

/** The base snapshot of the workspace's one started lot, read as JSON; undefined without the file. */
function baseSnapshotOf(start: ReturnType<typeof createStartWorkspace>): unknown {
	const [lot] = readdirSync(start.workspace.store)
	const file = join(start.workspace.store, lot, STORE_FILES.baseDeclared)
	return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined
}

describe('lot start - the design need', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a scope touching no declared area, no plan entry -> the dry run says design not required', () => {
		const start = createStartWorkspace()

		expect(
			withLines(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--dry-run'],
					now: START_NOW,
				}),
			).lines,
		).toContain('design not required')
	})

	it('a scope in a declared area -> the dry run names the area and what to record', () => {
		const start = createStartWorkspace()
		writeFileSync(
			join(start.workspace.repository, 'package.json'),
			`${JSON.stringify({ name: 'scratch', dialecte: { risk: { high: [DECLARED] } } })}\n`,
		)

		expect(
			withLines(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--effort', 'high', '--dry-run'],
					now: START_NOW,
				}),
			).lines,
		).toContain(REQUIRED_LINE)
	})

	it('a real start in a declared area -> the same line', () => {
		const start = createStartWorkspace()
		writeFileSync(
			join(start.workspace.repository, 'package.json'),
			`${JSON.stringify({ name: 'scratch', dialecte: { risk: { high: [DECLARED] } } })}\n`,
		)

		expect(
			withLines(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--effort', 'high'],
					now: START_NOW,
				}),
			).lines,
		).toContain(REQUIRED_LINE)
	})

	it("an area the base commit declares and the main checkout's file dropped -> the start reads the base through git and says required", () => {
		const start = baseDeclaringStart()

		expect(
			withLines(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--effort', 'high', '--dry-run'],
					now: START_NOW,
				}),
			).lines,
		).toContain(REQUIRED_LINE)
	})

	it("a real start -> the lot folder's base snapshot holds the base commit's areas", () => {
		const start = baseDeclaringStart()

		expect(
			runLot({
				cwd: start.cwd,
				argv: ['start', start.workspace.briefPath, '--effort', 'high'],
				now: START_NOW,
			}).exitCode,
		).toBe(0)
		expect(baseSnapshotOf(start)).toMatchObject({ schema: 1, globs: [DECLARED] })
	})
})
