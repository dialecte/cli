import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { readApiIndexes } from './read-api-indexes.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let root: string

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

function apiJson(packageName: string): string {
	return JSON.stringify({ package: packageName, methods: [] })
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-api-indexes-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('readApiIndexes', () => {
	it('own skills, installed dependencies, one without api.json, one not installed → the api.json present, by package', () => {
		write(
			'package.json',
			JSON.stringify({
				name: '@dialecte/scl',
				dependencies: { '@dialecte/core': '1', '@dialecte/missing': '1' },
				devDependencies: { '@dialecte/cli': '1' },
			}),
		)
		write('skills/dialecte-scl/SKILL.md', '---\n')
		write('skills/dialecte-scl/references/api.json', apiJson('@dialecte/scl'))
		write('node_modules/@dialecte/core/skills/dialecte/SKILL.md', '---\n')
		write(
			'node_modules/@dialecte/core/skills/dialecte/references/api.json',
			apiJson('@dialecte/core'),
		)
		write('node_modules/@dialecte/cli/package.json', '{}')

		expect(readApiIndexes({ cwd: root }).map((index) => index.package)).toEqual([
			'@dialecte/core',
			'@dialecte/scl',
		])
	})

	it('a malformed api.json → an error naming the file', () => {
		write('package.json', JSON.stringify({ dependencies: { '@dialecte/core': '1' } }))
		write('node_modules/@dialecte/core/skills/dialecte/SKILL.md', '---\n')
		write('node_modules/@dialecte/core/skills/dialecte/references/api.json', '{ "package": ')
		const path = join(root, 'node_modules/@dialecte/core/skills/dialecte/references/api.json')

		expect(() => readApiIndexes({ cwd: root })).toThrow(`${path} is not a valid api index (`)
	})

	it('an api.json of another shape → an error naming the file', () => {
		write('package.json', JSON.stringify({ dependencies: { '@dialecte/core': '1' } }))
		write('node_modules/@dialecte/core/skills/dialecte/SKILL.md', '---\n')
		write('node_modules/@dialecte/core/skills/dialecte/references/api.json', '{ "methods": 1 }')
		const path = join(root, 'node_modules/@dialecte/core/skills/dialecte/references/api.json')

		expect(() => readApiIndexes({ cwd: root })).toThrow(
			`${path} is not a valid api index (no package name or no method list): reinstall the package, or run \`dialecte skills generate\` in its repository`,
		)
	})
})
