import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	listHookConcernFiles,
	listRepositoryPaths,
	readNpmScripts,
	readWorkspaceFacts,
} from './package-facts.ts'

import { beforeEach, describe, expect, it } from 'vitest'

let root: string

function touch(path: string, content = ''): void {
	mkdirSync(join(root, path, '..'), { recursive: true })
	writeFileSync(join(root, path), content)
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-facts-'))
})

describe('listRepositoryPaths', () => {
	it('files and folders, relative and sorted; build output, dependencies and git left out', () => {
		touch('src/a.ts')
		touch('src/sub/b.ts')
		touch('node_modules/x/index.js')
		touch('dist/a.js')
		touch('.git/HEAD')

		expect(listRepositoryPaths(root)).toEqual(['src', 'src/a.ts', 'src/sub', 'src/sub/b.ts'])
	})

	it('a git repository → its tracked and unignored files only, ignored build output left out', () => {
		touch('.gitignore', 'playwright-report/\n')
		touch('src/a.ts')
		touch('playwright-report/index.html')
		spawnSync('git', ['init', '-q'], { cwd: root })
		spawnSync('git', ['add', 'src/a.ts'], { cwd: root })
		touch('src/new.ts')

		expect(listRepositoryPaths(root)).toEqual(['.gitignore', 'src', 'src/a.ts', 'src/new.ts'])
	})
})

describe('readNpmScripts', () => {
	it('package.json scripts → their names', () => {
		touch('package.json', JSON.stringify({ scripts: { check: 'x', 'doc:build': 'y' } }))

		expect(readNpmScripts(root)).toEqual(new Set(['check', 'doc:build']))
	})
})

describe('readWorkspaceFacts', () => {
	it('every package folder → paths prefixed with the folder, scripts merged', () => {
		touch('core/package.json', JSON.stringify({ scripts: { check: 'x' } }))
		touch('core/src/index.ts')
		touch('create/package.json', JSON.stringify({ scripts: { proof: 'x' } }))
		touch('notes/readme.md')

		const facts = readWorkspaceFacts(root)

		expect(facts.repositoryPaths).toEqual([
			'core/package.json',
			'core/src',
			'core/src/index.ts',
			'create/package.json',
		])
		expect(facts.npmScripts).toEqual(new Set(['check', 'proof']))
	})
})

describe('listHookConcernFiles', () => {
	it('hook folders of every version → concern files; tests, types, constants and barrels left out', () => {
		touch('src/v1/definition/constants.generated.ts')
		touch('src/v1/definition/definition.generated.ts')
		touch('src/v1/hooks/index.ts')
		touch('src/v1/hooks/after-created/index.ts')
		touch('src/v1/hooks/after-created/ref-paths.ts')
		touch('src/v1/hooks/after-created/ref-paths.test.ts')
		touch('src/v1/hooks/after-created/ref-paths.types.ts')
		touch('src/v1/hooks/after-created/after-created.ts')
		touch('src/v1/hooks/io/io-hooks.constants.ts')
		touch('src/v1/hooks/io/io-hooks.ts')

		expect(listHookConcernFiles(root)).toEqual({
			'after-created': ['after-created.ts', 'ref-paths.ts'],
			io: ['io-hooks.ts'],
		})
	})

	it('no hooks folder → empty', () => {
		expect(listHookConcernFiles(root)).toEqual({})
	})
})
