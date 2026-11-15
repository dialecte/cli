/** The registry pinned (keys, layers, overrides) and the check of each key; the two schemas name exactly its keys. */
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { shippedSchemaFilesOf } from '../release/shipped-schemas.ts'
import { CONFIG_KEYS } from './config-keys.constants.ts'

import { describe, expect, it } from 'vitest'

type Schema = { properties: Record<string, unknown>; additionalProperties?: unknown }

const PROJECT_KEYS = [
	'profile',
	'baseBranch',
	'gate',
	'contrib',
	'tdd',
	'references',
	'mutation',
	'generatedDocs',
	'risk',
	'rebuiltIgnored',
	'tsconfig',
	'namespace',
	'entry',
	'constantsDir',
	'out',
]
const PERSONAL_KEYS = [
	'editor',
	'load',
	'personProcesses',
	'forbiddenWords',
	'consumerNames',
	'corpora',
]

const PINNED = [
	...PROJECT_KEYS.map((key) => ({ key, layer: 'project', repoOverride: false })),
	...PERSONAL_KEYS.map((key) => ({ key, layer: 'personal', repoOverride: key !== 'corpora' })),
]

/** A valid value, a wrong shape and the exact problem that shape is described by (a key with several checks has several rows). */
const CHECK_ROWS: { key: string; valid: unknown; wrong: unknown; problem: string }[] = [
	{ key: 'profile', valid: 'contributor', wrong: 3, problem: 'must be a text' },
	{ key: 'baseBranch', valid: 'main', wrong: 3, problem: 'must be a text' },
	{ key: 'generatedDocs', valid: ['a'], wrong: 'a', problem: 'must be a list of texts' },
	{ key: 'rebuiltIgnored', valid: ['a'], wrong: 'a', problem: 'must be a list of texts' },
	{ key: 'tsconfig', valid: 'tsconfig.json', wrong: 3, problem: 'must be a text' },
	{ key: 'namespace', valid: 'demo', wrong: 3, problem: 'must be a text' },
	{ key: 'entry', valid: 'src/index.ts', wrong: 3, problem: 'must be a text' },
	{ key: 'constantsDir', valid: 'src', wrong: 3, problem: 'must be a text' },
	{ key: 'out', valid: 'dist', wrong: 3, problem: 'must be a text' },
	{
		key: 'load',
		valid: { budget: 4 },
		wrong: { budget: 1.5 },
		problem: 'budget must be a whole number of 1 or more',
	},
	{ key: 'gate', valid: { fast: ['check'] }, wrong: [], problem: 'must be a mapping' },
	{ key: 'gate', valid: { fast: ['check'] }, wrong: null, problem: 'must be a mapping' },
	{
		key: 'references',
		valid: { allow: ['a'], patterns: ['b'] },
		wrong: { allow: 'x' },
		problem: 'allow must be a list of texts',
	},
	{
		key: 'references',
		valid: { allow: ['a'], patterns: ['b'] },
		wrong: { patterns: 'x' },
		problem: 'patterns must be a list of texts',
	},
	{
		key: 'load',
		valid: { budget: 4 },
		wrong: { budget: 0 },
		problem: 'budget must be a whole number of 1 or more',
	},
	{ key: 'editor', valid: 'zed', wrong: 3, problem: 'must be a text' },
	{ key: 'personProcesses', valid: ['zsh'], wrong: 'zsh', problem: 'must be a list of texts' },
	{ key: 'forbiddenWords', valid: ['a'], wrong: [1], problem: 'must be a list of texts' },
	{ key: 'consumerNames', valid: ['a'], wrong: 'a', problem: 'must be a list of texts' },
	{
		key: 'corpora',
		valid: { a: { xsd: '/x', instances: '/y' } },
		wrong: { a: { instances: '/x' } },
		problem: "corpus 'a' needs xsd, the path of its XSD",
	},
	{ key: 'gate', valid: { fast: ['check'] }, wrong: 'fast', problem: 'must be a mapping' },
	{
		key: 'contrib',
		valid: { docs: 'doc:build' },
		wrong: 'doc:build',
		problem: 'must be a mapping',
	},
	{ key: 'tdd', valid: { runner: 'vitest' }, wrong: 'vitest', problem: 'must be a mapping' },
	{ key: 'mutation', valid: {}, wrong: 'x', problem: 'must be a mapping' },
	{ key: 'risk', valid: {}, wrong: 'x', problem: 'must be a mapping' },
]

/** The rows with a readable, unique name: the key and the wrong value. */
const CHECKS = CHECK_ROWS.map((row) => ({
	...row,
	name: `${row.key} ${JSON.stringify(row.wrong)}`,
}))

function readSchema(name: string): Schema {
	return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8')) as Schema
}

describe('CONFIG_KEYS', () => {
	it('holds exactly the pinned keys, layers and overrides, no key with a variable', () => {
		expect(
			CONFIG_KEYS.map((spec) => ({
				key: spec.key,
				layer: spec.layer,
				repoOverride: spec.repoOverride,
				environment: spec.environment,
			})),
		).toEqual(PINNED.map((pinned) => ({ ...pinned, environment: undefined })))
	})

	it.each(CHECKS)(
		'$name: a valid value holds, a wrong shape is described by its exact problem',
		({ key, valid, wrong, problem }) => {
			const spec = CONFIG_KEYS.find((candidate) => candidate.key === key)

			expect([spec?.problemOf(valid), spec?.problemOf(wrong)]).toEqual([undefined, problem])
		},
	)
})

describe('the schemas', () => {
	it('every shipped schema has its bare file name as $id', () => {
		const root = join(import.meta.dirname, '..', '..', '..')
		const files = shippedSchemaFilesOf({ root })

		expect(
			files.map((file) => ({
				file: basename(file),
				id: (JSON.parse(readFileSync(file, 'utf8')) as { $id?: string }).$id,
			})),
		).toEqual(files.map((file) => ({ file: basename(file), id: basename(file) })))
	})

	it.each([
		{ file: './dialecterc.schema.json', keys: PROJECT_KEYS },
		{ file: './config-yml.schema.json', keys: [...PERSONAL_KEYS, 'repos'] },
	])('$file names schema plus the keys of its layer, nothing else allowed', ({ file, keys }) => {
		const schema = readSchema(file)

		expect([
			Object.keys(schema.properties).sort(),
			schema.properties.schema,
			schema.additionalProperties,
		]).toEqual([['schema', ...keys].sort(), { const: 1 }, false])
	})
})
