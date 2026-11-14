/**
 * The gate's step source: package.json first (as before, a dialecte.json beside it unread); without one, a root
 * dialecte.json whose lists win, the lists it lacks inferred from the repository's files; neither, a refusal naming both.
 */
import { join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { readPackageJson } from '../package-json.ts'
import { readStepSource } from './step-source.ts'

import { describe, expect, it } from 'vitest'

const PYTEST = { name: 'tests', run: 'uv run pytest', counts: 'tests' }
const OWN = { name: 'own', run: 'make test' }
const UV_FILES = { 'pyproject.toml': '[project]\nname = "demo"\n', 'uv.lock': 'version = 1\n' }
const TOOLS = 'pyproject.toml + uv.lock (uv run pytest)'
const NOTHING_TO_RUN = `no package.json and nothing to run: write a dialecte.json at the root ({ "gate": { "fast": [...], "full": [...] } }), or hold the files the gate infers its steps from: ${TOOLS}`

function repositoryWith(files: Record<string, string>): string {
	const root = join(temporaryFolder('dialecte-step-source-'), 'repo')
	writeFiles({ root, files: { 'README.md': 'demo\n', ...files } })
	return root
}

function json(value: unknown): string {
	return `${JSON.stringify(value)}\n`
}

describe('readStepSource', () => {
	for (const { title, files, expected } of [
		{
			title:
				'no package.json, pyproject.toml + uv.lock → inferred: fast and full run uv run pytest',
			files: UV_FILES,
			expected: {
				origin: 'inferred',
				packageJson: { dialecte: { gate: { fast: [PYTEST], full: [PYTEST] } } },
			},
		},
		{
			title:
				'no package.json, pyproject.toml without uv.lock → the refusal naming dialecte.json and the inferred tools',
			files: { 'pyproject.toml': UV_FILES['pyproject.toml'] },
			expected: { refusal: NOTHING_TO_RUN },
		},
		{
			title: 'no package.json, uv.lock without pyproject.toml → the refusal naming both',
			files: { 'uv.lock': UV_FILES['uv.lock'] },
			expected: { refusal: NOTHING_TO_RUN },
		},
		{
			title: 'no package.json, no dialecte.json, nothing to infer → the refusal naming both',
			files: {},
			expected: { refusal: NOTHING_TO_RUN },
		},
		{
			title:
				'no package.json, a dialecte.json with fast and full → its lists, nothing inferred over them',
			files: {
				...UV_FILES,
				'dialecte.json': json({ schema: 1, gate: { fast: [OWN], full: [OWN] } }),
			},
			expected: {
				origin: 'dialecte.json',
				packageJson: { dialecte: { gate: { fast: [OWN], full: [OWN] } } },
			},
		},
		{
			title:
				'no package.json, a dialecte.json with full only and uv files → its full, fast inferred',
			files: { ...UV_FILES, 'dialecte.json': json({ gate: { full: [OWN] } }) },
			expected: {
				origin: 'dialecte.json',
				packageJson: { dialecte: { gate: { fast: [PYTEST], full: [OWN] } } },
			},
		},
		{
			title:
				'no package.json, a dialecte.json with release → kept as written beside the inferred lists',
			files: { ...UV_FILES, 'dialecte.json': json({ gate: { release: [OWN] } }) },
			expected: {
				origin: 'dialecte.json',
				packageJson: { dialecte: { gate: { fast: [PYTEST], full: [PYTEST], release: [OWN] } } },
			},
		},
		{
			title:
				'no package.json, a dialecte.json with a skip → the refusal: no default step to opt out of here',
			files: { ...UV_FILES, 'dialecte.json': json({ gate: { skip: { check: 'no npm here' } } }) },
			expected: {
				refusal:
					'dialecte.json: "gate.skip" opts out of a default npm step, and a repository without package.json has none: declare the lists instead',
			},
		},
		{
			title:
				'no package.json, a dialecte.json with full only and nothing to infer → the refusal naming the missing fast list',
			files: { 'dialecte.json': json({ gate: { full: [OWN] } }) },
			expected: {
				refusal: `dialecte.json: no "fast" list, and nothing to infer it from: declare it, or hold the files the gate infers its steps from: ${TOOLS}`,
			},
		},
		{
			title:
				'no package.json, a dialecte.json with fast only and nothing to infer → the refusal naming the missing full list',
			files: { 'dialecte.json': json({ gate: { fast: [OWN] } }) },
			expected: {
				refusal: `dialecte.json: no "full" list, and nothing to infer it from: declare it, or hold the files the gate infers its steps from: ${TOOLS}`,
			},
		},
		{
			title: 'no package.json, a dialecte.json that is no JSON → the refusal naming the file',
			files: { ...UV_FILES, 'dialecte.json': '{ gate: \n' },
			expected: { refusal: expect.stringMatching(/^dialecte\.json: not valid JSON \(.+\)$/) },
		},
		{
			title: 'no package.json, a dialecte.json holding a list → the refusal asking for an object',
			files: { ...UV_FILES, 'dialecte.json': json([OWN]) },
			expected: {
				refusal: 'dialecte.json: an object such as { "gate": { "fast": [...], "full": [...] } }',
			},
		},
		{
			title: 'no package.json, a dialecte.json with an unknown key → the refusal naming the key',
			files: { ...UV_FILES, 'dialecte.json': json({ gate: {}, baseBranch: 'develop' }) },
			expected: {
				refusal: 'dialecte.json: unknown key "baseBranch" (only "schema" and "gate" are read)',
			},
		},
		{
			title: 'no package.json, a dialecte.json of schema 2 → the refusal naming schema 1',
			files: { ...UV_FILES, 'dialecte.json': json({ schema: 2, gate: {} }) },
			expected: { refusal: 'dialecte.json: "schema" is 1' },
		},
		{
			title:
				'no package.json, a dialecte.json whose gate is a list → the refusal asking for an object',
			files: { ...UV_FILES, 'dialecte.json': json({ gate: [OWN] }) },
			expected: { refusal: 'dialecte.json: "gate" is an object of step lists' },
		},
		{
			title:
				'a package.json beside a dialecte.json and uv files → the package.json as written, the others unread',
			files: {
				...UV_FILES,
				'package.json': json({ name: 'demo', dialecte: { gate: { full: [OWN] } } }),
				'dialecte.json': '{ not json\n',
			},
			expected: {
				origin: 'package.json',
				packageJson: { name: 'demo', dialecte: { gate: { full: [OWN] } } },
			},
		},
		{
			title:
				'a package.json without dialecte beside uv files → the package.json as written, nothing inferred',
			files: { ...UV_FILES, 'package.json': json({ name: 'demo' }) },
			expected: { origin: 'package.json', packageJson: { name: 'demo' } },
		},
	]) {
		it(title, () => {
			const root = repositoryWith(files)

			expect(readStepSource(root)).toEqual(expected)
		})
	}
})

describe('readPackageJson without a package.json', () => {
	for (const { title, files, expected } of [
		{
			title: 'pyproject.toml + uv.lock → the inferred gate lists, as every gate reader sees them',
			files: UV_FILES,
			expected: { dialecte: { gate: { fast: [PYTEST], full: [PYTEST] } } },
		},
		{
			title: 'a dialecte.json → its gate lists',
			files: { 'dialecte.json': json({ gate: { fast: [OWN], full: [OWN] } }) },
			expected: { dialecte: { gate: { fast: [OWN], full: [OWN] } } },
		},
		{
			title:
				'an invalid dialecte.json beside uv files → an empty object: the gate commands say the refusal',
			files: { ...UV_FILES, 'dialecte.json': '{ not json\n' },
			expected: {},
		},
		{
			title: 'nothing to run → an empty object, as before',
			files: {},
			expected: {},
		},
	]) {
		it(title, () => {
			const root = repositoryWith(files)

			expect(readPackageJson(root)).toEqual(expected)
		})
	}
})
