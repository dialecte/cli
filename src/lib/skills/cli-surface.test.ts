import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { CLI_SURFACE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { UNAVAILABLE_REASONS } from './cli-invocations.constants.ts'
import { readCliSurface } from './cli-surface.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let root: string

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-surface-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

/** An installed cli whose bin runs `body` (a node script) in place of the real one. */
function installCli(body: string): void {
	write('package.json', JSON.stringify({ name: 'app' }))
	write(
		'node_modules/@dialecte/cli/package.json',
		JSON.stringify({ name: '@dialecte/cli', version: '9.9.9', bin: { dialecte: './bin.js' } }),
	)
	write('node_modules/@dialecte/cli/bin.js', body)
}

/** A bin that answers `answer` to `--help --json` and exits 2 to anything else. */
function answering(answer: string): string {
	return `const args = process.argv.slice(2).join(' ')
if (args !== '--help --json') { console.error('unexpected: ' + args); process.exit(2) }
process.stdout.write(${JSON.stringify(answer)})
`
}

const MAP_ANSWER = JSON.stringify({
	commands: [
		{
			name: 'lot',
			family: 'Grow',
			summary: 's',
			usage: [],
			exitCodes: [],
			example: 'e',
			verbs: ['finding'],
			flags: ['--round'],
		},
		{
			name: 'gate',
			family: 'Check',
			summary: 's',
			usage: [],
			exitCodes: [],
			example: 'e',
			verbs: [],
			flags: ['--fast'],
		},
	],
	renamed: [{ old: 'record review', new: 'lot finding' }],
})

const PRE_MAP_ANSWER = JSON.stringify({
	commands: [
		{ name: 'gate', family: 'Check', summary: 's', usage: [], exitCodes: [], example: 'e' },
	],
})

describe('readCliSurface', { timeout: CLI_SURFACE_CASE_TIMEOUT }, () => {
	it('the package is the cli itself → the map module answers, in process', () => {
		write('package.json', JSON.stringify({ name: '@dialecte/cli' }))

		expect(readCliSurface({ cwd: root })).toMatchObject({
			surface: {
				commands: expect.arrayContaining([
					expect.objectContaining({
						name: 'lot',
						verbs: expect.arrayContaining(['finding', 'decide', 'recap']),
					}),
					expect.objectContaining({ name: 'gate', flags: expect.arrayContaining(['--hook']) }),
				]),
				renamed: expect.arrayContaining([{ old: 'record review', new: 'lot finding' }]),
			},
		})
	})

	it('the cli itself ignores an installed cli of its own folder → the map module still answers', () => {
		installCli(answering(PRE_MAP_ANSWER))
		write('package.json', JSON.stringify({ name: '@dialecte/cli' }))

		expect(readCliSurface({ cwd: root })).toMatchObject({
			surface: { commands: expect.arrayContaining([expect.objectContaining({ name: 'lot' })]) },
		})
	})

	it('another package with an installed cli answering the map → its JSON', () => {
		installCli(answering(MAP_ANSWER))

		expect(readCliSurface({ cwd: root })).toMatchObject({
			surface: {
				commands: [
					{ name: 'lot', verbs: ['finding'], flags: ['--round'] },
					{ name: 'gate', verbs: [], flags: ['--fast'] },
				],
				renamed: [{ old: 'record review', new: 'lot finding' }],
			},
		})
	})

	it('an installed cli before the map (commands without verbs) → unavailable, with a reason', () => {
		installCli(answering(PRE_MAP_ANSWER))

		expect(readCliSurface({ cwd: root })).toEqual({ unavailable: expect.stringMatching(/\S/) })
	})

	it('an installed cli answering text that is no JSON → unavailable', () => {
		installCli(answering('Usage: dialecte <command>'))

		expect(readCliSurface({ cwd: root })).toEqual({ unavailable: expect.stringMatching(/\S/) })
	})

	it('an installed cli that prints the map then exits 1 → unavailable', () => {
		installCli(`${answering(MAP_ANSWER)}process.exit(1)\n`)

		expect(readCliSurface({ cwd: root })).toEqual({ unavailable: expect.stringMatching(/\S/) })
	})

	it('no cli installed in a package that is not the cli → unavailable', () => {
		write('package.json', JSON.stringify({ name: 'app' }))

		expect(readCliSurface({ cwd: root })).toEqual({ unavailable: expect.stringMatching(/\S/) })
	})

	it('an installed cli whose package.json starts with a BOM (it resolves, JSON.parse fails) → unavailable, the bad manifest reason', () => {
		write('package.json', JSON.stringify({ name: 'app' }))
		write(
			'node_modules/@dialecte/cli/package.json',
			`\uFEFF${JSON.stringify({ name: '@dialecte/cli', version: '9.9.9', bin: { dialecte: './bin.js' } })}`,
		)
		write('node_modules/@dialecte/cli/bin.js', answering(MAP_ANSWER))

		expect(readCliSurface({ cwd: root })).toEqual({ unavailable: UNAVAILABLE_REASONS.badManifest })
	})
})
