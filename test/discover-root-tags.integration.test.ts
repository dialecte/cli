import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discoverMethods } from '../src/lib/discover.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MethodEntry } from '../src/lib/discover.types.ts'

/** Builds a TypeScript program per call: wide slack for a loaded shared machine. */
const PROGRAM_TEST_TIMEOUT = 120_000

let root: string

function write(path: string, content: string): void {
	mkdirSync(join(root, path, '..'), { recursive: true })
	writeFileSync(join(root, path), content)
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-discover-root-tags-'))
	write(
		'tsconfig.json',
		JSON.stringify({
			compilerOptions: {
				strict: true,
				module: 'esnext',
				moduleResolution: 'bundler',
				target: 'es2022',
				noEmit: true,
			},
		}),
	)
	write('src/internal-only.ts', '/** @internal */\nexport function internalOnly(): void {}\n')
	write(
		'src/intent-only.ts',
		'/** @intent find a thing */\nexport function intentOnly(): void {}\n',
	)
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

function rootMethods(): MethodEntry[] {
	return discoverMethods({
		entrySource: [
			"import { internalOnly } from '../../../src/internal-only'",
			"import { intentOnly } from '../../../src/intent-only'",
			'const q = { internalOnly, intentOnly }',
			'export { q }',
			'',
		].join('\n'),
		tsconfig: 'tsconfig.json',
		root,
	})
}

describe(
	'discoverMethods, root methods whose JSDoc holds tags only',
	{ timeout: PROGRAM_TEST_TIMEOUT },
	() => {
		it('a root method documented with /** @internal */ only → internal, no summary', () => {
			expect(rootMethods().find((method) => method.path === 'q.internalOnly')).toMatchObject({
				internal: true,
				summary: undefined,
			})
		})

		it('a root method documented with /** @intent find a thing */ only → intents read, summary undefined', () => {
			expect(rootMethods().find((method) => method.path === 'q.intentOnly')).toMatchObject({
				intents: ['find a thing'],
				summary: undefined,
				internal: false,
			})
		})
	},
)
