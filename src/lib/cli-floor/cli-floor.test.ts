import { mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import {
	ABOVE_VERSION,
	FAR_ABOVE_VERSION,
	OWN_VERSION,
} from '../../../test/cli-floor-workspace.constants.ts'
import {
	bareFolder,
	cliManifestAt,
	createFloorStart,
	createPackageRepository,
	isolateState,
	manifestPinning,
} from '../../../test/cli-floor-workspace.ts'
import { writeFiles } from '../../../test/scratch-repository.ts'
import { CLI_PACKAGE } from '../skills/cli-invocations.constants.ts'
import { cliFloorOf, floorRefusalOf } from './cli-floor.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CliFloor, RunningCli } from './cli-floor.types.ts'

/** The running cli of a case: the sources' own version, started by a path of the case. */
function runningAt(params: { version: string | undefined }): RunningCli {
	return { version: params.version, invokedPath: '/bin/dialecte', realPath: '/lib/cli/dist/cli.js' }
}

/** The refusal's lines as one text. */
function textOf(lines: string[] | undefined): string | undefined {
	return lines?.join('\n')
}

/** Whether the refusal's text names each of the two folders. */
function foldersNamedIn(params: { lines: string[] | undefined; highest: string; lower: string }): {
	highest: boolean
	lower: boolean
} {
	const text = textOf(params.lines) ?? ''
	return { highest: text.includes(params.highest), lower: text.includes(params.lower) }
}

/** The version and source of a floor, the parts a row compares. */
function summaryOf(floor: CliFloor | undefined): Pick<CliFloor, 'version' | 'source'> | undefined {
	return floor === undefined ? undefined : { version: floor.version, source: floor.source }
}

/** Whether the refusal's text hints `npm install` and whether it hints `npx`. */
function hintsOf(lines: string[] | undefined): { npmInstall: boolean; npx: boolean } {
	const text = textOf(lines) ?? ''
	return { npmInstall: text.includes('npm install'), npx: text.includes('npx') }
}

/** Whether the refusal hints an update, and whether that hint is `git -C <checkout> pull`. */
function updateHintOf(params: { lines: string[] | undefined; checkout: string }): {
	update: boolean
	named: boolean
} {
	const text = textOf(params.lines) ?? ''
	return { update: text.includes('pull'), named: text.includes(`git -C ${params.checkout} pull`) }
}

describe('cliFloorOf', () => {
	const ROWS: Array<{
		name: string
		files: Record<string, string>
		floor: Pick<CliFloor, 'version' | 'source'> | undefined
	}> = [
		{
			name: 'the cli repository → its own version',
			files: { 'package.json': cliManifestAt({ version: '1.2.3' }) },
			floor: { version: '1.2.3', source: 'own' },
		},
		{
			name: 'a pin → the lowest version of its range',
			files: { 'package.json': manifestPinning({ spec: '^1.2.3' }) },
			floor: { version: '1.2.3', source: 'pin' },
		},
		{
			name: 'a file: pin with the cli installed → the installed version',
			files: {
				'package.json': manifestPinning({ spec: 'file:../cli-x.tgz' }),
				'node_modules/@dialecte/cli/package.json': `${JSON.stringify({ name: CLI_PACKAGE, version: ABOVE_VERSION })}\n`,
			},
			floor: { version: ABOVE_VERSION, source: 'installed' },
		},
		{
			name: 'a pin * (no lower bound) with the cli installed above → the installed version',
			files: {
				'package.json': manifestPinning({ spec: '*' }),
				'node_modules/@dialecte/cli/package.json': `${JSON.stringify({ name: CLI_PACKAGE, version: ABOVE_VERSION })}\n`,
			},
			floor: { version: ABOVE_VERSION, source: 'installed' },
		},
		{
			name: 'a pin workspace:* (no lower bound) with the cli installed above → the installed version',
			files: {
				'package.json': manifestPinning({ spec: 'workspace:*' }),
				'node_modules/@dialecte/cli/package.json': `${JSON.stringify({ name: CLI_PACKAGE, version: ABOVE_VERSION })}\n`,
			},
			floor: { version: ABOVE_VERSION, source: 'installed' },
		},
		{
			name: 'a pin <2.0.0 (no lower bound) with the cli installed above → the installed version',
			files: {
				'package.json': manifestPinning({ spec: '<2.0.0' }),
				'node_modules/@dialecte/cli/package.json': `${JSON.stringify({ name: CLI_PACKAGE, version: ABOVE_VERSION })}\n`,
			},
			floor: { version: ABOVE_VERSION, source: 'installed' },
		},
		{
			name: 'a pin x (no lower bound) with the cli installed above → the installed version',
			files: {
				'package.json': manifestPinning({ spec: 'x' }),
				'node_modules/@dialecte/cli/package.json': `${JSON.stringify({ name: CLI_PACKAGE, version: ABOVE_VERSION })}\n`,
			},
			floor: { version: ABOVE_VERSION, source: 'installed' },
		},
		{
			name: 'a pin an empty spec (no lower bound) with the cli installed above → the installed version',
			files: {
				'package.json': manifestPinning({ spec: '' }),
				'node_modules/@dialecte/cli/package.json': `${JSON.stringify({ name: CLI_PACKAGE, version: ABOVE_VERSION })}\n`,
			},
			floor: { version: ABOVE_VERSION, source: 'installed' },
		},
		{
			name: 'a pin ^1.0.0 || <0.5.0 (an alternative with no lower bound) with the cli installed above → the installed version',
			files: {
				'package.json': manifestPinning({ spec: '^1.0.0 || <0.5.0' }),
				'node_modules/@dialecte/cli/package.json': `${JSON.stringify({ name: CLI_PACKAGE, version: ABOVE_VERSION })}\n`,
			},
			floor: { version: ABOVE_VERSION, source: 'installed' },
		},
		{
			name: 'a file: pin with no cli installed → no floor',
			files: { 'package.json': manifestPinning({ spec: 'file:../cli-x.tgz' }) },
			floor: undefined,
		},
		{
			name: 'a package.json that is no JSON → no floor, no throw',
			files: { 'package.json': '{ not json' },
			floor: undefined,
		},
		{
			name: 'the cli repository without a version → no floor',
			files: { 'package.json': `${JSON.stringify({ name: CLI_PACKAGE })}\n` },
			floor: undefined,
		},
		{
			name: 'a package that does not ask for the cli → no floor',
			files: { 'package.json': `${JSON.stringify({ name: 'other' })}\n` },
			floor: undefined,
		},
		{ name: 'a folder with no package.json → no floor', files: {}, floor: undefined },
	]
	for (const row of ROWS)
		it(row.name, () => {
			const folder = bareFolder()
			writeFiles({ root: folder, files: row.files })

			expect(summaryOf(cliFloorOf({ folder }))).toEqual(row.floor)
		})
})

describe('cliFloorOf with a spec that is not a string', () => {
	it('a spec that is not a string → no floor, no throw', () => {
		const folder = bareFolder()
		writeFiles({
			root: folder,
			files: {
				'package.json': `${JSON.stringify({ name: 'other', devDependencies: { [CLI_PACKAGE]: 1 } })}\n`,
			},
		})

		expect(() => cliFloorOf({ folder })).not.toThrow()
	})
})

describe('floorRefusalOf', () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	it('a running version it cannot read, with a floor → refused with a line saying so', () => {
		const cwd = createPackageRepository({
			manifest: manifestPinning({ spec: `^${ABOVE_VERSION}` }),
		})
		isolateState()

		expect(
			textOf(
				floorRefusalOf({
					cwd,
					argv: ['status', 'x'],
					running: runningAt({ version: undefined }),
				}),
			),
		).toMatch(/could not be read/)
	})

	it('a running version that is no semver version, with a floor → refused with a line saying so', () => {
		const cwd = createPackageRepository({
			manifest: manifestPinning({ spec: `^${ABOVE_VERSION}` }),
		})
		isolateState()

		expect(
			textOf(
				floorRefusalOf({
					cwd,
					argv: ['status', 'x'],
					running: runningAt({ version: 'not-a-version' }),
				}),
			),
		).toMatch(/could not be read/)
	})

	it('a running version it cannot read, with no floor → allowed', () => {
		const cwd = bareFolder()
		isolateState()

		expect(
			floorRefusalOf({ cwd, argv: ['status', 'x'], running: runningAt({ version: undefined }) }),
		).toBeUndefined()
	})

	it('a running cli installed under a parent folder’s node_modules (hoisted) → the hint names npm install, not npx', () => {
		const parent = bareFolder()
		const folder = join(parent, 'pkg')
		writeFiles({
			root: parent,
			files: {
				'pkg/package.json': manifestPinning({ spec: `^${ABOVE_VERSION}` }),
				'node_modules/@dialecte/cli/package.json': `${JSON.stringify({ name: CLI_PACKAGE, version: OWN_VERSION })}\n`,
				'node_modules/@dialecte/cli/dist/cli.js': '',
			},
		})
		const realPath = join(parent, 'node_modules', '@dialecte', 'cli', 'dist', 'cli.js')

		expect(
			hintsOf(
				floorRefusalOf({
					cwd: folder,
					argv: ['status', 'x'],
					running: { version: OWN_VERSION, invokedPath: realPath, realPath },
				}),
			),
		).toEqual({ npmInstall: true, npx: false })
	})

	it('a running cli in a pnpm store folder, linked from the floor root’s node_modules → the hint names npm install, not npx', () => {
		const root = bareFolder()
		const store = join(
			root,
			'node_modules',
			'.pnpm',
			'@dialecte+cli@1.0.0',
			'node_modules',
			'@dialecte',
			'cli',
		)
		writeFiles({
			root,
			files: {
				'package.json': manifestPinning({ spec: `^${ABOVE_VERSION}` }),
				'node_modules/.pnpm/@dialecte+cli@1.0.0/node_modules/@dialecte/cli/dist/cli.js': '',
			},
		})
		mkdirSync(join(root, 'node_modules', '@dialecte'), { recursive: true })
		symlinkSync(store, join(root, 'node_modules', '@dialecte', 'cli'))
		const invokedPath = join(root, 'node_modules', '.bin', 'dialecte')
		const realPath = join(store, 'dist', 'cli.js')

		expect(
			hintsOf(
				floorRefusalOf({
					cwd: root,
					argv: ['status', 'x'],
					running: { version: OWN_VERSION, invokedPath, realPath },
				}),
			),
		).toEqual({ npmInstall: true, npx: false })
	})

	const CHECKOUTS: Array<{ name: string; files: Record<string, string>; update: boolean }> = [
		{
			name: 'inside a git checkout of the cli → the hint names git -C <root> pull',
			files: { '.git/HEAD': 'ref: refs/heads/main\n' },
			update: true,
		},
		{ name: 'the same layout without .git → no pull hint', files: {}, update: false },
	]
	for (const row of CHECKOUTS)
		it(`a running cli ${row.name}`, () => {
			const checkout = bareFolder()
			writeFiles({
				root: checkout,
				files: {
					'package.json': cliManifestAt({ version: OWN_VERSION }),
					'dist/cli.js': '',
					...row.files,
				},
			})
			const cwd = createPackageRepository({
				manifest: manifestPinning({ spec: `^${ABOVE_VERSION}` }),
			})
			const realPath = join(checkout, 'dist', 'cli.js')

			expect(
				updateHintOf({
					lines: floorRefusalOf({
						cwd,
						argv: ['status', 'x'],
						running: { version: OWN_VERSION, invokedPath: realPath, realPath },
					}),
					checkout,
				}),
			).toEqual({ update: row.update, named: row.update })
		})

	it('the running version equal to the floor → allowed', () => {
		const cwd = createPackageRepository({ manifest: manifestPinning({ spec: `^${OWN_VERSION}` }) })
		isolateState()

		expect(
			floorRefusalOf({ cwd, argv: ['status', 'x'], running: runningAt({ version: OWN_VERSION }) }),
		).toBeUndefined()
	})

	it('the highest floor of several folders wins and is the one named', () => {
		const start = createFloorStart({ manifest: manifestPinning({ spec: `^${FAR_ABOVE_VERSION}` }) })
		const cwd = createPackageRepository({
			manifest: manifestPinning({ spec: `^${ABOVE_VERSION}` }),
		})

		expect(
			foldersNamedIn({
				lines: floorRefusalOf({
					cwd,
					argv: ['start', start.workspace.briefPath],
					running: runningAt({ version: OWN_VERSION }),
				}),
				highest: realpathSync(start.repository),
				lower: realpathSync(cwd),
			}),
		).toEqual({ highest: true, lower: false })
	})
})
