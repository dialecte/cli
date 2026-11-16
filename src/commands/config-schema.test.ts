/**
 * `config list|get|check --json` against their versioned schema (`config-list.schema.json`, one `oneOf` of the three
 * shapes): real outputs validate, and a hand check of the keywords the schema uses (required, additionalProperties,
 * type, enum, items, minimum, $ref, oneOf) refuses a broken object, so a drift of either side fails here.
 */
import { readFileSync } from 'node:fs'

import { HOST_PLATFORM } from '../../test/config-workspace.constants.ts'
import { createConfigWorkspace } from '../../test/config-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runConfig } from './config.ts'

import { describe, expect, it } from 'vitest'

import type { ConfigWorkspace } from '../../test/config-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { RunConfigParams } from './config.types.ts'

type Schema = Record<string, unknown>

const SCHEMA_URL = new URL('./config-list.schema.json', import.meta.url)
const ROOT_SCHEMA = JSON.parse(readFileSync(SCHEMA_URL, 'utf8')) as Schema

/** The faults of `value` against `schema` (the keywords above only); empty when it validates. */
function faultsOf(params: { value: unknown; schema: Schema; path: string }): string[] {
	const { value, path } = params
	const schema = resolved(params.schema)
	const faults: string[] = []
	if (Array.isArray(schema.oneOf)) {
		const options = schema.oneOf as Schema[]
		const matching = options.filter(function validates(option) {
			return faultsOf({ value, schema: option, path }).length === 0
		}).length
		if (matching === 1) return []
		return [`${path}: matches ${matching === 0 ? 'none' : 'several'} of oneOf`]
	}
	if (schema.type !== undefined && !hasType({ value, type: schema.type as string }))
		return [`${path}: not a ${String(schema.type)}`]
	if (Array.isArray(schema.enum) && !schema.enum.includes(value))
		faults.push(`${path}: not in enum`)
	if (typeof schema.minimum === 'number' && typeof value === 'number' && value < schema.minimum)
		faults.push(`${path}: below minimum`)
	if (Array.isArray(value) && schema.items !== undefined)
		faults.push(
			...value.flatMap(function itemFaults(item, index) {
				return faultsOf({ value: item, schema: schema.items as Schema, path: `${path}[${index}]` })
			}),
		)
	if (schema.type === 'object') faults.push(...objectFaultsOf({ value, schema, path }))
	return faults
}

/** The faults of an object: a missing required key, an unknown key when none is allowed, each property. */
function objectFaultsOf(params: { value: unknown; schema: Schema; path: string }): string[] {
	const record = params.value as Record<string, unknown>
	const properties = (params.schema.properties ?? {}) as Record<string, Schema>
	const required = (params.schema.required ?? []) as string[]
	const missing = required
		.filter(function isMissing(key) {
			return !(key in record)
		})
		.map(function missingFault(key) {
			return `${params.path}.${key}: missing`
		})
	const unknown =
		params.schema.additionalProperties === false
			? Object.keys(record)
					.filter(function isUnknown(key) {
						return !(key in properties)
					})
					.map(function unknownFault(key) {
						return `${params.path}.${key}: unknown key`
					})
			: []
	const inner = Object.keys(properties).flatMap(function propertyFaults(key) {
		return key in record
			? faultsOf({ value: record[key], schema: properties[key], path: `${params.path}.${key}` })
			: []
	})
	return [...missing, ...unknown, ...inner]
}

/** The schema a `$ref` of the root points at (`#/$defs/<name>`); the schema itself otherwise. */
function resolved(schema: Schema): Schema {
	if (typeof schema.$ref !== 'string') return schema
	const name = schema.$ref.replace('#/$defs/', '')
	return (ROOT_SCHEMA.$defs as Record<string, Schema>)[name]
}

/** Whether `value` is of the JSON type `type`. */
function hasType(params: { value: unknown; type: string }): boolean {
	const { value, type } = params
	if (type === 'array') return Array.isArray(value)
	if (type === 'null') return value === null
	if (type === 'integer') return Number.isInteger(value)
	if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
	return typeof value === type
}

/** The faults of a value against the schema of `config --json`. */
function outputFaultsOf(value: unknown): string[] {
	return faultsOf({ value, schema: ROOT_SCHEMA, path: '$' })
}

/** What `runConfig` is called with on `workspace`, on the host platform. */
function callOf(params: { workspace: ConfigWorkspace; argv: string[] }): RunConfigParams {
	const { workspace } = params
	return {
		cwd: workspace.root,
		argv: params.argv,
		environment: workspace.environment,
		platform: HOST_PLATFORM,
		home: workspace.home,
	}
}

/** The faults of the JSON an answer printed. */
function answerFaultsOf(result: CommandResult): string[] {
	return outputFaultsOf(JSON.parse(result.output))
}

const PROJECT = 'schema: 1\nbaseBranch: main\neditor: zed\nzzz: 1\ngate:\n  fast: [check]\n'
const PERSONAL = 'schema: 1\nload:\n  budget: 10\n'

describe('config --json - the schema', { timeout: STORE_CASE_TIMEOUT }, () => {
	const REAL: {
		name: string
		argv: string[]
		options: Parameters<typeof createConfigWorkspace>[0]
	}[] = [
		{ name: 'list with no file', argv: ['list', '--json'], options: {} },
		{
			name: 'list with values, findings and a note',
			argv: ['list', '--json'],
			options: {
				project: PROJECT,
				personal: `${PERSONAL}editor: zed\n`,
				gitConfig: { 'dialecte.editor': 'zed' },
			},
		},
		{ name: 'list without a remote', argv: ['list', '--json'], options: { origin: null } },
		{ name: 'get', argv: ['get', 'load.budget', '--json'], options: { personal: PERSONAL } },
		{
			name: 'get of a key not set',
			argv: ['get', 'editor', '--json'],
			options: { personal: PERSONAL },
		},
		{ name: 'check with no finding', argv: ['check', '--json'], options: { personal: PERSONAL } },
		{ name: 'check with findings', argv: ['check', '--json'], options: { project: PROJECT } },
	]

	it.each(REAL)('$name validates', ({ argv, options }) => {
		const workspace = createConfigWorkspace(options)

		expect(answerFaultsOf(runConfig(callOf({ workspace, argv })))).toEqual([])
	})

	const WHOLE_SOURCE = { kind: 'personal', file: 'b', line: 2 }
	const WHOLE_FINDING = { file: 'a', line: 1, key: 'k', problem: 'p', refused: true }
	const WHOLE_LIST = {
		schema: 1,
		projectFile: 'a',
		personalFile: 'b',
		repo: { key: 'k', from: 'remote' },
		values: [{ key: 'editor', value: 'zed', source: WHOLE_SOURCE }],
		findings: [WHOLE_FINDING],
		notes: ['n'],
	}
	const WHOLE_GET = { schema: 1, key: 'editor', value: 'zed', source: WHOLE_SOURCE }
	const WHOLE_CHECK = { schema: 1, ok: false, findings: [WHOLE_FINDING], notes: [] }

	const BROKEN: { name: string; value: unknown }[] = [
		{ name: 'a list without findings', value: { ...WHOLE_LIST, findings: undefined } },
		{ name: 'a list with a stranger key', value: { ...WHOLE_LIST, extra: 1 } },
		{
			name: 'a list whose repo.from is out of the list',
			value: { ...WHOLE_LIST, repo: { key: 'k', from: 'cloud' } },
		},
		{
			name: 'a list value without its source',
			value: { ...WHOLE_LIST, values: [{ key: 'editor', value: 'zed' }] },
		},
		{
			name: 'a finding without refused',
			value: { ...WHOLE_LIST, findings: [{ file: 'a', line: 1, problem: 'p' }] },
		},
		{
			name: 'a finding whose line is a text',
			value: { ...WHOLE_CHECK, findings: [{ ...WHOLE_FINDING, line: 'one' }] },
		},
		{
			name: 'a list source of a kind out of the four',
			value: {
				...WHOLE_LIST,
				values: [{ key: 'editor', value: 'zed', source: { kind: 'cloud' } }],
			},
		},
		{
			name: 'a get whose source is the text of the line',
			value: { ...WHOLE_GET, source: 'b:2' },
		},
		{
			name: 'a repo source without its repo',
			value: { ...WHOLE_GET, source: { kind: 'repo', file: 'b', line: 2 } },
		},
		{
			name: 'a finding whose line is -1',
			value: { ...WHOLE_CHECK, findings: [{ ...WHOLE_FINDING, line: -1 }] },
		},
		{ name: 'a get without its key', value: { schema: 1, value: 'zed', source: WHOLE_SOURCE } },
		{ name: 'a get with a stranger key', value: { ...WHOLE_GET, extra: 1 } },
		{ name: 'a check whose ok is a text', value: { ...WHOLE_CHECK, ok: 'no' } },
		{ name: 'a check without notes', value: { schema: 1, ok: true, findings: [] } },
		{ name: 'a schema version other than 1', value: { ...WHOLE_CHECK, schema: 2 } },
	]

	it.each(BROKEN)('$name is a fault', ({ value }) => {
		expect(outputFaultsOf(value)).toEqual(['$: matches none of oneOf'])
	})

	const SOURCES = [
		{ kind: 'personal', file: 'b', line: 2 },
		{ kind: 'project', file: 'a', line: 3 },
		{ kind: 'repo', file: 'b', line: 8, repo: 'github.com/example/repo' },
		{ kind: 'environment', variable: 'CI' },
	]

	it('each of the four source kinds validates in a get, and $defs.source is a oneOf of four', () => {
		const sourceDef = (ROOT_SCHEMA.$defs as Record<string, Schema> | undefined)?.source
		expect({
			faults: SOURCES.map((source) => outputFaultsOf({ ...WHOLE_GET, source })),
			kinds: (sourceDef?.oneOf as unknown[] | undefined)?.length,
		}).toEqual({ faults: [[], [], [], []], kinds: 4 })
	})

	it('a oneOf that matches two options is a fault, none or one is not (S5)', () => {
		const schema: Schema = { oneOf: [{ type: 'integer' }, { type: 'number' }] }

		expect([1, 1.5, 'x'].map((value) => faultsOf({ value, schema, path: '$' }))).toEqual([
			['$: matches several of oneOf'],
			[],
			['$: matches none of oneOf'],
		])
	})

	it('a get of a key not set (source null, findings) validates', () => {
		const unset = { schema: 1, key: 'editor', value: null, source: null, findings: [WHOLE_FINDING] }

		expect(outputFaultsOf(unset)).toEqual([])
	})

	it('the three whole shapes validate', () => {
		expect({
			faults: [WHOLE_LIST, WHOLE_GET, WHOLE_CHECK].map(outputFaultsOf),
			shapes: (ROOT_SCHEMA.oneOf as unknown[] | undefined)?.length,
		}).toEqual({ faults: [[], [], []], shapes: 3 })
	})
})
