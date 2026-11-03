/** The cli's own scripts and commit hook: the suite runs once, in `gate --hook`, not in `check`. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = join(import.meta.dirname, '..', '..')

function readScripts(): Record<string, string> {
	return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).scripts
}

describe("the cli's own scripts and commit hook", () => {
	it('check → type-check, lint:check and format:check, no suite', () => {
		const { check } = readScripts()

		expect(check).toBe('npm run type-check && npm run lint:check && npm run format:check')
	})

	it('test:hook → the repository cli running gate --hook', () => {
		const scripts = readScripts()

		expect(scripts['test:hook']).toBe('node src/cli.ts gate --hook')
	})

	it('.husky/pre-commit → npm run check, npm run test:hook, npm run build, in that order', () => {
		const hook = readFileSync(join(PACKAGE_ROOT, '.husky', 'pre-commit'), 'utf8')

		expect(
			hook
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean),
		).toEqual(['npm run check', 'npm run test:hook', 'npm run build'])
	})
})
