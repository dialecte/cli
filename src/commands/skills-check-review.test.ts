import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { linesWritten, spyStreams } from '../../test/stream-spies.ts'
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { commandSurfaceOf } from '../lib/command-map/command-surface.ts'
import { checkPages } from './skills.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StreamSpies } from '../../test/stream-spies.types.ts'

const FRONTMATTER = '---\nname: demo\ndescription: Use it.\n---\n'

let root: string
let streams: StreamSpies

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-skills-check-'))
	streams = spyStreams()
})

afterEach(() => {
	vi.restoreAllMocks()
	rmSync(root, { recursive: true, force: true })
})

describe('checkPages, the summary line (R1-9)', () => {
	it('no installed cli → exit 0, the summary says the invocations were not checked', () => {
		write('package.json', JSON.stringify({ name: 'app' }))
		write('skills/demo/SKILL.md', `${FRONTMATTER}Run \`dialecte gate --fast\`.\n`)

		expect(checkPages({ cwd: root, methods: [], workspace: undefined })).toBe(0)
		expect(linesWritten(streams.stdout)).toEqual([
			expect.stringMatching(/^✅ 1 skill page\(s\).*\(cli invocations not checked\)$/),
		])
	})
})

describe('checkPages, no page cites the cli (R2-2)', () => {
	it('no invocation on any page → the installed cli is never run, no warning, no summary suffix', () => {
		write('package.json', JSON.stringify({ name: 'app' }))
		write(
			'node_modules/@dialecte/cli/package.json',
			JSON.stringify({ name: '@dialecte/cli', version: '9.9.9', bin: { dialecte: './bin.js' } }),
		)
		// the bin leaves a mark when it runs, and answers no map
		write(
			'node_modules/@dialecte/cli/bin.js',
			`require('node:fs').writeFileSync(${JSON.stringify(join(root, 'ran'))}, '')\n`,
		)
		write('skills/demo/SKILL.md', `${FRONTMATTER}Use the \`skills/\` folder, no command.\n`)

		expect(checkPages({ cwd: root, methods: [], workspace: undefined })).toBe(0)
		expect(existsSync(join(root, 'ran'))).toBe(false)
		expect(streams.stderr).not.toHaveBeenCalled()
		expect(linesWritten(streams.stdout)).toEqual([
			expect.not.stringContaining('cli invocations not checked'),
		])
	})
})

describe('the skills usage lines (R1-10)', () => {
	it('generate and check → the zero-config flags they read are skills flags', () => {
		expect(commandSurfaceOf({ name: 'skills', entry: COMMAND_MAP.skills }).flags).toEqual(
			expect.arrayContaining([
				'--namespace',
				'--entry',
				'--constants-dir',
				'--out',
				'--version',
				'--tsconfig',
				'--format-config',
				'--no-format',
				'--workspace',
			]),
		)
	})
})
