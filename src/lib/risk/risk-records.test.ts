import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { appendRiskLine, effectiveEffort, readRiskRecords, riskCapOf } from './risk-records.ts'
import { RISK_FILE, RISK_LINE_LIMIT } from './risk.constants.ts'

import { afterEach, describe, expect, it } from 'vitest'

import type { LotIdentity } from '../store/store.types.ts'
import type { RiskCap, RiskDerivedLine, RiskEffortLine, RiskReason } from './risk.types.ts'

const RISK_RECORDS_MODULE = join(import.meta.dirname, 'risk-records.ts')
const SCHEMA_FILE = join(import.meta.dirname, 'risk-line.schema.json')

const folders: string[] = []

afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function makeFolder(): string {
	const folder = mkdtempSync(join(tmpdir(), 'risk-records-'))
	folders.push(folder)
	return folder
}

/** The identity of a lot at the given effort level. */
function identityJson(level: string): string {
	const identity: LotIdentity = {
		schema: 1,
		name: '0077-cli-risk-effort-l1b',
		index: '0077',
		repository: '/repo',
		store: '/repo/.git/dialecte-lots',
		worktree: '/repo/.worktrees/0077-cli-risk-effort-l1b',
		branch: 'feat/risk-effort-l1b',
		base: { ref: 'main', commit: '217a953' },
		feature: 'risk-effort-l1b',
		effort: { level, source: 'default' },
		simulated: false,
		scenario: null,
		cli: '0.4.0',
		briefHash: 'sha256:aaaa',
		planHash: 'sha256:bbbb',
		created: '2026-11-13T08:00:00.000Z',
	}
	return JSON.stringify(identity)
}

/** The lines of a `risk.jsonl`, one JSON object per line. */
function jsonLines(...lines: unknown[]): string {
	return lines.map((line) => `${JSON.stringify(line)}\n`).join('')
}

const EFFORT_MEDIUM: RiskEffortLine = {
	schema: 1,
	kind: 'effort',
	at: '2026-11-13T09:00:00.000Z',
	effort: 'medium',
	by: 'person-a',
}
const EFFORT_HIGH: RiskEffortLine = {
	schema: 1,
	kind: 'effort',
	at: '2026-11-13T10:00:00.000Z',
	effort: 'high',
	class: 'high',
	by: 'person-a',
	reason: 'writes the store',
}
const EFFORT_LOW: RiskEffortLine = {
	schema: 1,
	kind: 'effort',
	at: '2026-11-13T11:00:00.000Z',
	effort: 'low',
	by: 'person-a',
	reason: 'a version bump',
}
const DERIVED_HIGH: RiskDerivedLine = {
	schema: 1,
	kind: 'derived',
	at: '2026-11-13T09:30:00.000Z',
	class: 'high',
	reasons: [
		{ kind: 'destructive', file: 'src/lib/cleanup/x.ts', line: 12, detail: 'rmSync' },
		{ kind: 'declared', file: 'src/lib/store/publish.ts', detail: 'src/lib/store/**' },
	],
	from: 'snapshot',
}
const DERIVED_LIGHT: RiskDerivedLine = {
	schema: 1,
	kind: 'derived',
	at: '2026-11-13T09:45:00.000Z',
	class: 'light',
	reasons: [{ kind: 'docs', detail: 'only docs changed' }],
	from: 'snapshot',
}

describe('appendRiskLine and readRiskRecords', () => {
	it('an effort line and a derived line round-trip whole, in file order', () => {
		const folder = makeFolder()
		expect({
			records: ((lines) => {
				for (const line of lines) appendRiskLine({ folder, line })
				return readRiskRecords({ folder })
			})([EFFORT_MEDIUM, DERIVED_HIGH, EFFORT_HIGH]),
			text: readFileSync(join(folder, RISK_FILE), 'utf8'),
		}).toEqual({
			text: jsonLines(EFFORT_MEDIUM, DERIVED_HIGH, EFFORT_HIGH),
			records: { effort: [EFFORT_MEDIUM, EFFORT_HIGH], derived: [DERIVED_HIGH], skipped: 0 },
		})
	})

	it('a missing risk.jsonl → nothing, nothing skipped', () => {
		expect(readRiskRecords({ folder: makeFolder() })).toEqual({
			effort: [],
			derived: [],
			skipped: 0,
		})
	})

	const skipCases: { name: string; text: string; skipped: number; derived?: number }[] = [
		{
			name: 'a torn last line after a good effort line',
			text: `${jsonLines(EFFORT_MEDIUM)}{"schema":1,"kind":"effort","at":"2026-11-13T12:00`,
			skipped: 1,
		},
		{
			name: 'a line of schema 2',
			text: jsonLines(EFFORT_MEDIUM, { ...EFFORT_HIGH, schema: 2 }),
			skipped: 1,
		},
		{
			name: 'a line of kind other',
			text: jsonLines(EFFORT_MEDIUM, { schema: 1, kind: 'other', at: '2026-11-13T12:00:00.000Z' }),
			skipped: 1,
		},
		{
			name: 'a line that is no JSON',
			text: `${jsonLines(EFFORT_MEDIUM)}not json at all\n`,
			skipped: 1,
		},
		{
			name: 'a JSON line that is no object',
			text: `${jsonLines(EFFORT_MEDIUM)}[1,2]\n`,
			skipped: 1,
		},
		{
			name: 'all three kinds of damage in the middle',
			text: `${jsonLines(EFFORT_MEDIUM)}garbage\n${jsonLines({ ...DERIVED_HIGH, schema: 2 }, { schema: 1, kind: 'other' })}${jsonLines(DERIVED_LIGHT)}`,
			skipped: 3,
			derived: 1,
		},
	]
	for (const { name, text, skipped, derived = 0 } of skipCases) {
		it(`${name} → skipped and counted, the good lines read`, () => {
			const folder = makeFolder()
			writeFileSync(join(folder, RISK_FILE), text)
			expect(
				((records) => ({
					effort: records.effort,
					derived: records.derived.length,
					skipped: records.skipped,
				}))(readRiskRecords({ folder })),
			).toEqual({
				effort: [EFFORT_MEDIUM],
				derived,
				skipped,
			})
		})
	}

	it('case 30: a torn last line after a good effort line → skipped 1, the previous effort line current', () => {
		const folder = makeFolder()
		writeFileSync(
			join(folder, RISK_FILE),
			`${jsonLines(EFFORT_MEDIUM, EFFORT_HIGH)}{"schema":1,"kind":"effort","at":"2026-1`,
		)
		expect({
			skipped: readRiskRecords({ folder }).skipped,
			effort: effectiveEffort({ folder }),
		}).toEqual({ skipped: 1, effort: 'high' })
	})

	it('a derived line over the limit → one line under the limit, the first reasons that fit and a last more reason', () => {
		const folder = makeFolder()
		const total = 60
		const reasons: RiskReason[] = Array.from({ length: total }, (_, index) => ({
			kind: 'size',
			file: `src/file-${index}.ts`,
			detail: 'd'.repeat(100),
		}))
		function bytesOf(line: RiskDerivedLine) {
			return Buffer.byteLength(`${JSON.stringify(line)}\n`)
		}
		function lineWith(kept: number): RiskDerivedLine {
			return {
				...DERIVED_HIGH,
				reasons: [...reasons.slice(0, kept), { kind: 'more', detail: `${total - kept} more` }],
			}
		}
		expect(
			((line) => {
				appendRiskLine({ folder, line })
				const text = readFileSync(join(folder, RISK_FILE), 'utf8')
				const stored = readRiskRecords({ folder }).derived[0]
				const kept = (stored?.reasons.length ?? 0) - 1
				return {
					lines: text.split('\n').filter((entry) => entry !== '').length,
					underLimit: Buffer.byteLength(text) <= RISK_LINE_LIMIT,
					someKept: kept > 0,
					whole: JSON.stringify(stored) === JSON.stringify(lineWith(kept)),
					oneMoreWouldNotFit: bytesOf(lineWith(kept + 1)) > RISK_LINE_LIMIT,
				}
			})({ ...DERIVED_HIGH, reasons }),
		).toEqual({
			lines: 1,
			underLimit: true,
			someKept: true,
			whole: true,
			oneMoreWouldNotFit: true,
		})
	})

	it('every line the appends make validates against risk-line.schema.json', () => {
		const folder = makeFolder()
		const reasons: RiskReason[] = Array.from({ length: 60 }, (_, index) => ({
			kind: 'size',
			file: `src/file-${index}.ts`,
			line: index,
			detail: 'd'.repeat(100),
		}))
		const appended = [
			EFFORT_MEDIUM,
			EFFORT_HIGH,
			EFFORT_LOW,
			DERIVED_HIGH,
			DERIVED_LIGHT,
			{ ...DERIVED_HIGH, class: 'medium', from: 'start', reasons: [] } satisfies RiskDerivedLine,
			{ ...DERIVED_HIGH, from: 'handover-write', reasons } satisfies RiskDerivedLine,
		]
		expect(
			((lines) => {
				for (const line of lines) appendRiskLine({ folder, line })
				return readFileSync(join(folder, RISK_FILE), 'utf8')
					.split('\n')
					.filter((line) => line !== '')
					.map((line) => violationsOf({ value: JSON.parse(line) as unknown }))
			})(appended),
		).toEqual(appended.map(() => []))
	})
})

describe('two processes append', () => {
	it(
		'case 29: two concurrent appends → two whole lines, the later in the file is the current effort',
		{ timeout: STORE_CASE_TIMEOUT },
		async () => {
			const folder = makeFolder()
			const script = `
				const { appendRiskLine } = await import(process.argv[1])
				appendRiskLine({
					folder: process.argv[2],
					line: { schema: 1, kind: 'effort', at: new Date().toISOString(), effort: process.argv[3], by: 'person-' + process.argv[3] },
				})
			`
			const outcomes = await Promise.all(
				(['low', 'high'] as const).map(
					(effort) =>
						new Promise<{ exit: number | null; stderr: string }>((resolve) => {
							const child = spawn(
								process.execPath,
								[
									'--input-type=module',
									'-e',
									script,
									pathToFileURL(RISK_RECORDS_MODULE).href,
									folder,
									effort,
								],
								{ stdio: ['ignore', 'ignore', 'pipe'] },
							)
							let stderr = ''
							child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
							child.on('exit', (code) => resolve({ exit: code, stderr: stderr.slice(0, 300) }))
							child.on('error', (error) => resolve({ exit: null, stderr: String(error) }))
						}),
				),
			)
			const file = (
				existsSync(join(folder, RISK_FILE)) ? readFileSync(join(folder, RISK_FILE), 'utf8') : ''
			)
				.split('\n')
				.filter((line) => line !== '')
				.map((line) => (JSON.parse(line) as RiskEffortLine).effort)
			expect(file).toHaveLength(2)
			expect({
				exits: outcomes,
				efforts: [...file].sort(),
				skipped: readRiskRecords({ folder }).skipped,
				current: effectiveEffort({ folder }),
			}).toEqual({
				exits: [
					{ exit: 0, stderr: '' },
					{ exit: 0, stderr: '' },
				],
				efforts: ['high', 'low'],
				skipped: 0,
				current: file.at(-1),
			})
		},
	)
})

type FolderCase = {
	name: string
	files: Record<string, string>
	effort: 'low' | 'medium' | 'high' | undefined
}

describe('effectiveEffort', () => {
	const cases: FolderCase[] = [
		{
			name: 'case 31: no risk.jsonl, identity medium → medium',
			files: { 'identity.json': identityJson('medium') },
			effort: 'medium',
		},
		{ name: 'no identity and no file → undefined', files: {}, effort: undefined },
		{
			name: 'only a brief.json with effort high → undefined (the swap pin)',
			files: { 'brief.json': JSON.stringify({ effort: 'high' }) },
			effort: undefined,
		},
		{
			name: 'identity medium, then an effort line high → high',
			files: { 'identity.json': identityJson('medium'), [RISK_FILE]: jsonLines(EFFORT_HIGH) },
			effort: 'high',
		},
		{
			name: 'identity medium and brief high, derived lines only → medium',
			files: {
				'identity.json': identityJson('medium'),
				'brief.json': JSON.stringify({ effort: 'high' }),
				[RISK_FILE]: jsonLines(DERIVED_HIGH),
			},
			effort: 'medium',
		},
		{
			name: 'the file order wins over at: an earlier line with a later at is not current',
			files: {
				[RISK_FILE]: jsonLines(
					EFFORT_LOW,
					EFFORT_HIGH,
					{ ...EFFORT_MEDIUM, at: '2026-11-13T18:00:00.000Z' },
					{ ...EFFORT_LOW, at: '2026-11-12T01:00:00.000Z' },
				),
			},
			effort: 'low',
		},
		{
			name: 'a last line of another schema is skipped → the previous effort line',
			files: { [RISK_FILE]: jsonLines(EFFORT_HIGH, { ...EFFORT_LOW, schema: 2 }) },
			effort: 'high',
		},
	]
	for (const { name, files, effort } of cases) {
		it(name, () => {
			const folder = makeFolder()
			for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text)
			expect(effectiveEffort({ folder })).toBe(effort)
		})
	}
})

describe('riskCapOf', () => {
	const NO_CAP: RiskCap = { cap: 1, effort: undefined, class: undefined, raisedBy: undefined }
	const cases: { name: string; files: Record<string, string>; expected: RiskCap }[] = [
		{ name: 'no effort and no file → cap 1', files: {}, expected: NO_CAP },
		{
			name: 'no effort, derived high → cap 1 (a person effort is required past round 1)',
			files: { [RISK_FILE]: jsonLines(DERIVED_HIGH) },
			expected: NO_CAP,
		},
		{
			name: 'brief.json effort high only → cap 1 (the swap pin)',
			files: { 'brief.json': JSON.stringify({ effort: 'high' }) },
			expected: NO_CAP,
		},
		{
			name: 'identity medium → cap 2',
			files: { 'identity.json': identityJson('medium') },
			expected: { cap: 2, effort: 'medium', class: 'medium', raisedBy: undefined },
		},
		{
			name: 'case 18: identity medium, then an effort line high → cap 3',
			files: { 'identity.json': identityJson('medium'), [RISK_FILE]: jsonLines(EFFORT_HIGH) },
			expected: { cap: 3, effort: 'high', class: 'high', raisedBy: undefined },
		},
		{
			name: 'case 19: identity medium, then an effort line low → cap 1',
			files: { 'identity.json': identityJson('medium'), [RISK_FILE]: jsonLines(EFFORT_LOW) },
			expected: { cap: 1, effort: 'low', class: 'light', raisedBy: undefined },
		},
		{
			name: 'effort medium, last derived high → cap 3 raised by derived',
			files: { 'identity.json': identityJson('medium'), [RISK_FILE]: jsonLines(DERIVED_HIGH) },
			expected: { cap: 3, effort: 'medium', class: 'high', raisedBy: 'derived' },
		},
		{
			name: 'effort medium, a derived high then a derived light → the last counts, cap 2',
			files: {
				'identity.json': identityJson('medium'),
				[RISK_FILE]: jsonLines(DERIVED_HIGH, DERIVED_LIGHT),
			},
			expected: { cap: 2, effort: 'medium', class: 'medium', raisedBy: undefined },
		},
		{
			name: 'effort low with an effort line class medium → cap 2 raised by effort-class',
			files: {
				[RISK_FILE]: jsonLines({ ...EFFORT_LOW, class: 'medium' }),
			},
			expected: { cap: 2, effort: 'low', class: 'medium', raisedBy: 'effort-class' },
		},
		{
			name: 'only the last effort line class counts: an earlier class high, a last line without class → cap 2',
			files: { [RISK_FILE]: jsonLines(EFFORT_HIGH, EFFORT_MEDIUM) },
			expected: { cap: 2, effort: 'medium', class: 'medium', raisedBy: undefined },
		},
	]
	for (const { name, files, expected } of cases) {
		it(name, () => {
			const folder = makeFolder()
			for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text)
			expect(riskCapOf({ folder })).toEqual(expected)
		})
	}

	it('effort medium, a last derived high, a class derived now medium → the class now replaces it, cap 2', () => {
		const folder = makeFolder()
		writeFileSync(join(folder, 'identity.json'), identityJson('medium'))
		writeFileSync(join(folder, RISK_FILE), jsonLines(DERIVED_HIGH))

		expect(riskCapOf({ folder, derivedNow: 'medium' })).toEqual({
			cap: 2,
			effort: 'medium',
			class: 'medium',
			raisedBy: undefined,
		})
	})

	it('case 19: an effort lowered by an appended line changes nothing else in the folder', () => {
		const folder = makeFolder()
		writeFileSync(join(folder, 'identity.json'), identityJson('medium'))
		writeFileSync(join(folder, 'brief.json'), JSON.stringify({ effort: 'medium' }))
		function others() {
			return readdirSync(folder)
				.filter((file) => file !== RISK_FILE)
				.sort()
				.map((file) => [file, readFileSync(join(folder, file), 'utf8')])
		}
		const before = others()
		expect({
			cap: ((line) => {
				appendRiskLine({ folder, line })
				return riskCapOf({ folder }).cap
			})(EFFORT_LOW),
			others: others(),
		}).toEqual({ cap: 1, others: before })
	})
})

// ---------------------------------------------------------------------------------------------------------------
// A small hand-written check of a value against risk-line.schema.json: required keys, types, enums, consts.

type SchemaNode = {
	type?: string
	const?: unknown
	enum?: unknown[]
	required?: string[]
	properties?: Record<string, SchemaNode>
	items?: SchemaNode
	additionalProperties?: boolean
	$ref?: string
}

type SchemaFile = { oneOf: SchemaNode[]; $defs: Record<string, SchemaNode> }

/** The node a `$ref` of this schema points at (`#/$defs/<name>`), or the node itself. */
function resolveNode(params: { schema: SchemaFile; node: SchemaNode }): SchemaNode {
	const { schema, node } = params
	return node.$ref === undefined
		? node
		: (schema.$defs[node.$ref.replace('#/$defs/', '')] as SchemaNode)
}

/** What is wrong with a value against a node: missing keys, wrong types, values outside an enum or const. */
function nodeViolations(params: {
	schema: SchemaFile
	node: SchemaNode
	value: unknown
	path: string
}): string[] {
	const { schema, value, path } = params
	const node = resolveNode({ schema, node: params.node })
	if (node.const !== undefined)
		return value === node.const ? [] : [`${path}: not ${String(node.const)}`]
	if (node.enum !== undefined) return node.enum.includes(value) ? [] : [`${path}: not in enum`]
	if (node.type === 'string') return typeof value === 'string' ? [] : [`${path}: not a string`]
	if (node.type === 'integer') return Number.isInteger(value) ? [] : [`${path}: not an integer`]
	if (node.type === 'array') {
		if (!Array.isArray(value)) return [`${path}: not an array`]
		return value.flatMap((item, index) =>
			nodeViolations({
				schema,
				node: node.items as SchemaNode,
				value: item,
				path: `${path}[${index}]`,
			}),
		)
	}
	if (node.type === 'object') {
		if (typeof value !== 'object' || value === null || Array.isArray(value))
			return [`${path}: not an object`]
		const record = value as Record<string, unknown>
		const properties = node.properties ?? {}
		return [
			...(node.required ?? [])
				.filter((key) => !(key in record))
				.map((key) => `${path}.${key}: missing`),
			...Object.keys(record)
				.filter((key) => node.additionalProperties === false && !(key in properties))
				.map((key) => `${path}.${key}: not allowed`),
			...Object.entries(properties).flatMap(([key, child]) =>
				key in record
					? nodeViolations({ schema, node: child, value: record[key], path: `${path}.${key}` })
					: [],
			),
		]
	}
	return []
}

/** The violations of a value against both line kinds of the schema: empty when one kind accepts it. */
function violationsOf(params: { value: unknown }): string[] {
	const schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')) as SchemaFile
	const perKind = schema.oneOf.map((node) =>
		nodeViolations({ schema, node, value: params.value, path: '$' }),
	)
	return perKind.some((violations) => violations.length === 0) ? [] : perKind.flat()
}
