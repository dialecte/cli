import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { findDialecteEntry } from './load-run-environment.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let root: string

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-run-entry-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

function writeJson(path: string, content: unknown): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), JSON.stringify(content))
}

/** A project depending on the packages named, each installed with the export paths given. */
function project(params: { packages: Record<string, string[]> }): void {
	const dependencies = Object.fromEntries(
		Object.keys(params.packages).map((name) => [name, '1.0.0']),
	)
	writeJson('package.json', { name: 'app', dependencies })
	for (const [name, entries] of Object.entries(params.packages))
		writeJson(`node_modules/${name}/package.json`, {
			name,
			exports: Object.fromEntries(entries.map((entry) => [entry, `./dist/${entry}.js`])),
		})
}

describe('findDialecteEntry', () => {
	type TestCase = {
		packages: Record<string, string[]>
		expected: { entry: string } | { error: string }
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'one dialecte with one entry beside its test entry → that entry': {
			packages: { '@dialecte/core': ['.'], '@dialecte/widget': ['./v1', './v1/test'] },
			expected: { entry: '@dialecte/widget/v1' },
		},
		'no dialecte → an error asking for --package': {
			packages: { '@dialecte/core': ['.'], '@dialecte/cli': ['.'] },
			expected: {
				error: 'run: no dialecte package in package.json - name one with --package <name>',
			},
		},
		'two dialectes → an error naming both': {
			packages: { '@dialecte/scl': ['./v1'], '@dialecte/widget': ['./v1'] },
			expected: {
				error:
					'run: several dialectes installed (@dialecte/scl, @dialecte/widget) - name one with --package <name>',
			},
		},
		'a dialecte with several entries → an error naming them': {
			packages: { '@dialecte/widget': ['./v1', './v2'] },
			expected: {
				error:
					'run: @dialecte/widget has several entries (./v1, ./v2) - name one with --package @dialecte/widget/<entry>',
			},
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		const declare = testCase.only ? it.only : it
		declare(description, () => {
			project({ packages: testCase.packages })
			const find = () =>
				findDialecteEntry({
					projectDirectory: root,
					resolveFromProject: createRequire(join(root, 'package.json')),
				})
			if ('entry' in testCase.expected) expect(find()).toBe(testCase.expected.entry)
			else expect(find).toThrow(testCase.expected.error)
		})
	}
})
