import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { BLOCK_END, BLOCK_START } from './command-reference.constants.ts'
import {
	checkReferencePages,
	composePage,
	renderCommandBlock,
	renderIndexBlock,
	writeReferencePages,
} from './command-reference.ts'
import { listedCommands } from './render-help.ts'

import { afterEach, describe, expect, it } from 'vitest'

import type { ReferenceCommand, ReferenceSource } from './command-reference.types.ts'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..', '..')
const MAIN = join(import.meta.dirname, 'command-reference-main.ts')

const GATE: ReferenceCommand = {
	name: 'gate',
	entry: {
		family: 'Check',
		summary: 'The Definition of Done <with counts> for *.ts files',
		usage: ['dialecte gate [--full] [--json]'],
		exitCodes: ['3 a hand-over holds the repository'],
		example: 'dialecte gate --full',
		notes: ['--full - every step, then ```json blocks'],
	},
}

const API: ReferenceCommand = {
	name: 'api',
	entry: {
		family: 'Discover',
		summary: 'Find a method',
		usage: ['dialecte api find "<need>"', 'dialecte api show <path>'],
		exitCodes: [],
		example: 'dialecte api find "add a child"',
	},
}

const SOURCE: ReferenceSource = {
	commands: [API, GATE],
	renamed: [
		{ old: 'record review', new: 'lot finding' },
		{ old: 'recap', new: 'lot recap' },
	],
}

const folders: string[] = []

/** A folder of its own for a test: the pages written there by the real map. */
function packageWithPages(): string {
	const root = mkdtempSync(join(tmpdir(), 'dialecte-reference-'))
	folders.push(root)
	writeFileSync(join(root, '.oxfmtrc.json'), readFileSync(join(PACKAGE_ROOT, '.oxfmtrc.json')))
	writeReferencePages({ root })
	mkdirSync(join(root, 'doc', 'commands'), { recursive: true })
	return root
}

afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('the command reference blocks', () => {
	it('a command entry -> its block: summary, usage code block, notes, exit codes when declared, example, verbs and flags', () => {
		const block = renderCommandBlock(GATE)

		expect(block).toContain('The Definition of Done &lt;with counts&gt; for \\*.ts files')
		expect(block).toContain('````text\ngate - The Definition of Done <with counts> for *.ts files')
		expect(block).toContain('  dialecte gate [--full] [--json]')
		expect(block).toContain('  --full - every step, then ```json blocks')
		expect(block).toContain('  3 a hand-over holds the repository')
		expect(block).toContain('e.g. dialecte gate --full\n````')
		expect(block).toContain('Flags: `--full`, `--json`')
		expect(block).not.toContain('Verbs:')
	})

	it('the index -> families in help order, each command linked with its summary, the renamed table', () => {
		const block = renderIndexBlock(SOURCE)

		expect(block.match(/^##+ .+$/gm)).toEqual(['## Discover', '## Check', '## Renamed in 1.0'])
		expect(block).toContain('| [`dialecte api`](api.md) | Find a method |')
		expect(block).toContain(
			'| [`dialecte gate`](gate.md) | The Definition of Done &lt;with counts&gt; for \\*.ts files |',
		)
		expect(block.match(/^\| `dialecte .+$/gm)).toEqual([
			'| `dialecte lot finding` | `dialecte record review` |',
			'| `dialecte lot recap` | `dialecte recap` |',
		])
	})
})

describe('a page with its block', () => {
	it('a page with prose -> the block between the markers replaced, the prose kept byte for byte', () => {
		const page = `# dialecte gate\n\n${BLOCK_START}\nold\n${BLOCK_END}\n\nProse  with *two* spaces.\n\n- a list\n`

		const composed = composePage({ title: 'dialecte gate', block: 'new', page })

		expect(composed).toBe(
			`# dialecte gate\n\n${BLOCK_START}\nnew\n${BLOCK_END}\n\nProse  with *two* spaces.\n\n- a list\n`,
		)
	})

	it('a missing page -> a title and the block', () => {
		const composed = composePage({ title: 'dialecte gate', block: 'new' })

		expect(composed).toBe(`# dialecte gate\n\n${BLOCK_START}\nnew\n${BLOCK_END}\n`)
	})
})

describe('the reference pages against the command map', () => {
	it('a stale page -> the check names it stale', () => {
		const root = packageWithPages()
		writeFileSync(join(root, 'doc', 'commands', 'gate.md'), '# dialecte gate\n\nProse.\n')

		expect(checkReferencePages({ root }).faults).toEqual([
			{ path: 'doc/commands/gate.md', kind: 'stale' },
		])
	})

	it('a missing page -> the check names it missing', () => {
		const root = packageWithPages()
		rmSync(join(root, 'doc', 'commands', 'tdd.md'), { force: true })

		expect(checkReferencePages({ root }).faults).toEqual([
			{ path: 'doc/commands/tdd.md', kind: 'missing' },
		])
	})

	it('an extra page -> the check names it extra', () => {
		const root = packageWithPages()
		writeFileSync(join(root, 'doc', 'commands', 'record.md'), '# dialecte record\n')

		expect(checkReferencePages({ root }).faults).toEqual([
			{ path: 'doc/commands/record.md', kind: 'extra' },
		])
	})

	it('doc:check on a stale page -> its line on stderr, exit 1', () => {
		const root = packageWithPages()
		writeFileSync(join(root, 'doc', 'commands', 'gate.md'), '# dialecte gate\n\nProse.\n')

		const run = spawnSync(process.execPath, [MAIN, '--check'], { cwd: root, encoding: 'utf8' })

		expect(run.status).toBe(1)
		expect(run.stderr).toContain('doc/commands/gate.md: stale - run npm run doc:generate')
	})

	it('the committed pages -> no fault, a page per listed command and the index', () => {
		const check = checkReferencePages({ root: PACKAGE_ROOT })

		expect(check).toEqual({ pages: listedCommands().length + 1, faults: [] })
	})
})
