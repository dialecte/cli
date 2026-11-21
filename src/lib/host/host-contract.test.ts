/**
 * `checkHostContract` proves a vendor's call table against what its tool was recorded to describe: one finding per
 * kind of fault, naming the table key and `npm run host:refresh`, the same for any vendor (a fixture second vendor
 * has its own table, its own implied flags and its own aliases); then every committed record is clean.
 */
import { checkHostContract } from './check-host-contract.ts'
import { impliedFlagsOf as githubImpliedFlagsOf } from './github/run-gh.ts'
import { HOST_CONTRACTS } from './host-contracts.constants.ts'

import { describe, expect, it } from 'vitest'

import type {
	HostCallSpec,
	HostCallTable,
	HostContract,
	HostFindingKind,
	HostFlagAlias,
} from './host.types.ts'

/** What tells one vendor from another: its command words, the flags its specs imply, and each one's alias. */
type VendorShape = {
	label: string
	show: readonly string[]
	query: readonly string[]
	send: readonly string[]
	fieldsFlag: string
	fieldsAlias: HostFlagAlias
	queryFlag: string
	queryAlias: HostFlagAlias
	filterFlag: string
	filterAlias: HostFlagAlias
	impliedFlagsOf(spec: HostCallSpec): string[]
}

/** A second vendor's implied flags: none of gh's. */
function otherImpliedFlagsOf(spec: HostCallSpec): string[] {
	return [
		...(spec.fields === undefined ? [] : ['--fields', spec.fields.join(',')]),
		...(spec.graphql === undefined ? [] : ['--gql', spec.graphql]),
		...(spec.filter === undefined ? [] : ['--select', spec.filter]),
	]
}

const QUERY = 'query($n:Int!){repository(name:"x"){pullRequest(number:$n){id}}}'

/** The schema's change-request field and type, under the names the query above uses. */
const REQUEST_FIELD = 'pullRequest'
const REQUEST_TYPE = 'PullRequest'

const VENDORS: readonly VendorShape[] = [
	{
		label: 'the first vendor (gh-like flags)',
		show: ['pr', 'view'],
		query: ['api'],
		send: ['pr', 'send'],
		fieldsFlag: '--json',
		fieldsAlias: { short: '-j', long: '--json' },
		queryFlag: '-f',
		queryAlias: { short: '-f', long: '--raw-field' },
		filterFlag: '--jq',
		filterAlias: { short: '-q', long: '--jq' },
		impliedFlagsOf: githubImpliedFlagsOf,
	},
	{
		label: 'a second vendor (its own flags)',
		show: ['mr', 'show'],
		query: ['gql'],
		send: ['mr', 'send'],
		fieldsFlag: '--fields',
		fieldsAlias: { short: '-F', long: '--fields' },
		queryFlag: '--gql',
		queryAlias: { short: '-g', long: '--gql' },
		filterFlag: '--select',
		filterAlias: { short: '-s', long: '--select' },
		impliedFlagsOf: otherImpliedFlagsOf,
	},
]

/** The vendor's valid table: a read with fields, a GraphQL read with a filter, a write with a flag. */
function callsOf(vendor: VendorShape): HostCallTable {
	return {
		show: { words: vendor.show, flags: ['--base'], kind: 'read', fields: ['id', 'title'] },
		query: {
			words: vendor.query,
			flags: ['--paginate'],
			kind: 'read',
			endpoint: 'graphql',
			graphql: QUERY,
			filter: '.data',
		},
		send: { words: vendor.send, flags: ['--draft'], kind: 'write' },
	}
}

/** What the vendor's tool was recorded to say about exactly that table. */
function contractOf(vendor: VendorShape): HostContract {
	return {
		commands: {
			[vendor.show.join(' ')]: {
				flags: ['--base', vendor.fieldsAlias.short, vendor.fieldsAlias.long],
				aliases: [vendor.fieldsAlias],
				fields: ['id', 'title', 'url'],
			},
			[vendor.query.join(' ')]: {
				flags: [
					'--paginate',
					vendor.queryAlias.short,
					vendor.queryAlias.long,
					vendor.filterAlias.short,
					vendor.filterAlias.long,
				],
				aliases: [vendor.queryAlias, vendor.filterAlias],
			},
			[vendor.send.join(' ')]: { flags: ['--draft'], aliases: [] },
		},
		graphql: {
			Query: { repository: { type: 'Repository', args: ['name'] } },
			Repository: { [REQUEST_FIELD]: { type: REQUEST_TYPE, args: ['number'] } },
			[REQUEST_TYPE]: { id: { type: 'ID', args: [] } },
		},
	}
}

/** One case: how the valid pair is altered, and the findings that must come of it. */
type Row = {
	label: string
	calls?: (vendor: VendorShape) => HostCallTable
	contract?: (vendor: VendorShape) => HostContract
	kinds: HostFindingKind[]
	/** The key each finding names: a table key, or the command path of a stale one. */
	key?: (vendor: VendorShape) => string
}

/** The command `path` of the valid contract, replaced by `command`. */
function withCommand(params: {
	vendor: VendorShape
	path: readonly string[]
	command: HostContract['commands'][string]
}): HostContract {
	const contract = contractOf(params.vendor)
	return {
		...contract,
		commands: { ...contract.commands, [params.path.join(' ')]: params.command },
	}
}

const ROWS: readonly Row[] = [
	{ label: 'a table and a record that agree → no finding', kinds: [] },
	{
		label: 'an entry whose command is not recorded → an unknown command',
		calls: (vendor) => ({
			...callsOf(vendor),
			ghost: { words: [...vendor.show.slice(0, 1), 'ghost'], flags: [], kind: 'read' },
		}),
		kinds: ['unknown-command'],
		key: () => 'ghost',
	},
	{
		label: 'a flag the command does not have → an unknown flag',
		calls: (vendor) => ({
			...callsOf(vendor),
			send: { words: vendor.send, flags: ['--draft', '--bogus'], kind: 'write' },
		}),
		kinds: ['unknown-flag'],
		key: () => 'send',
	},
	{
		label: 'a field the command does not list → an unknown field',
		calls: (vendor) => ({
			...callsOf(vendor),
			show: {
				words: vendor.show,
				flags: ['--base'],
				kind: 'read',
				fields: ['id', 'title', 'bogus'],
			},
		}),
		kinds: ['unknown-field'],
		key: () => 'show',
	},
	{
		label: 'a GraphQL field its type does not have → an unknown GraphQL field',
		calls: (vendor) => ({
			...callsOf(vendor),
			query: {
				words: vendor.query,
				flags: ['--paginate'],
				kind: 'read',
				endpoint: 'graphql',
				graphql: 'query($n:Int!){repository(name:"x"){pullRequest(number:$n){bogus}}}',
				filter: '.data',
			},
		}),
		kinds: ['unknown-graphql-field'],
		key: () => 'query',
	},
	{
		label: 'a GraphQL argument its field does not take → an unknown GraphQL argument',
		calls: (vendor) => ({
			...callsOf(vendor),
			query: {
				words: vendor.query,
				flags: ['--paginate'],
				kind: 'read',
				endpoint: 'graphql',
				graphql: 'query($n:Int!){repository(name:"x"){pullRequest(first:$n){id}}}',
				filter: '.data',
			},
		}),
		kinds: ['unknown-graphql-argument'],
		key: () => 'query',
	},
	{
		label: 'no fields flag recorded for a fields entry → a missing implied flag',
		contract: (vendor) =>
			withCommand({
				vendor,
				path: vendor.show,
				command: { flags: ['--base'], aliases: [], fields: ['id', 'title', 'url'] },
			}),
		kinds: ['missing-implied-flag'],
		key: () => 'show',
	},
	{
		label: 'no filter flag recorded for a filter entry → a missing implied flag',
		contract: (vendor) =>
			withCommand({
				vendor,
				path: vendor.query,
				command: {
					flags: ['--paginate', vendor.queryAlias.short, vendor.queryAlias.long],
					aliases: [vendor.queryAlias],
				},
			}),
		kinds: ['missing-implied-flag'],
		key: () => 'query',
	},
	{
		label: 'an implied flag recorded only through its alias → counts as recorded, no finding',
		contract: (vendor) =>
			withCommand({
				vendor,
				path: vendor.query,
				command: {
					flags: [
						'--paginate',
						vendor.queryAlias.short === vendor.queryFlag
							? vendor.queryAlias.long
							: vendor.queryAlias.short,
						vendor.filterAlias.short,
						vendor.filterAlias.long,
					],
					aliases: [vendor.queryAlias, vendor.filterAlias],
				},
			}),
		kinds: [],
	},
	{
		label: 'the fields flag in an entry’s flags → an implied flag in flags',
		calls: (vendor) => ({
			...callsOf(vendor),
			show: {
				words: vendor.show,
				flags: ['--base', vendor.fieldsFlag],
				kind: 'read',
				fields: ['id', 'title'],
			},
		}),
		kinds: ['implied-flag-in-flags'],
		key: () => 'show',
	},
	{
		label: 'the query flag’s alias in an entry’s flags → an implied flag in flags',
		calls: (vendor) => ({
			...callsOf(vendor),
			query: {
				words: vendor.query,
				flags: [
					'--paginate',
					vendor.queryAlias.short === vendor.queryFlag
						? vendor.queryAlias.long
						: vendor.queryAlias.short,
				],
				kind: 'read',
				endpoint: 'graphql',
				graphql: QUERY,
				filter: '.data',
			},
		}),
		kinds: ['implied-flag-in-flags'],
		key: () => 'query',
	},
	{
		label: 'no query flag, either form, recorded for a query entry → a missing implied flag',
		contract: (vendor) =>
			withCommand({
				vendor,
				path: vendor.query,
				command: {
					flags: ['--paginate', vendor.filterAlias.short, vendor.filterAlias.long],
					aliases: [vendor.filterAlias],
				},
			}),
		kinds: ['missing-implied-flag'],
		key: () => 'query',
	},
	{
		label: 'the fields flag’s alias in an entry’s flags → an implied flag in flags',
		calls: (vendor) => ({
			...callsOf(vendor),
			show: {
				words: vendor.show,
				flags: ['--base', vendor.fieldsAlias.short],
				kind: 'read',
				fields: ['id', 'title'],
			},
		}),
		kinds: ['implied-flag-in-flags'],
		key: () => 'show',
	},
	{
		label: 'a field only another type has (id on repository) → an unknown GraphQL field',
		calls: (vendor) => ({
			...callsOf(vendor),
			query: {
				words: vendor.query,
				flags: ['--paginate'],
				kind: 'read',
				endpoint: 'graphql',
				graphql: 'query($n:Int!){repository(name:"x"){id}}',
				filter: '.data',
			},
		}),
		kinds: ['unknown-graphql-field'],
		key: () => 'query',
	},
	{
		label:
			'an argument only another field takes (number on repository) → an unknown GraphQL argument',
		calls: (vendor) => ({
			...callsOf(vendor),
			query: {
				words: vendor.query,
				flags: ['--paginate'],
				kind: 'read',
				endpoint: 'graphql',
				graphql: 'query($n:Int!){repository(number:$n){pullRequest(number:$n){id}}}',
				filter: '.data',
			},
		}),
		kinds: ['unknown-graphql-argument'],
		key: () => 'query',
	},
	{
		label: 'a top-level field not on Query (pullRequest) → an unknown GraphQL field',
		calls: (vendor) => ({
			...callsOf(vendor),
			query: {
				words: vendor.query,
				flags: ['--paginate'],
				kind: 'read',
				endpoint: 'graphql',
				graphql: 'query($n:Int!){pullRequest(number:$n){id}}',
				filter: '.data',
			},
		}),
		kinds: ['unknown-graphql-field'],
		key: () => 'query',
	},
	{
		label: 'a recorded command no entry uses → a stale finding',
		contract: (vendor) =>
			withCommand({
				vendor,
				path: [...vendor.show.slice(0, 1), 'list'],
				command: { flags: ['--state'], aliases: [] },
			}),
		kinds: ['stale'],
		key: (vendor) => `${vendor.show[0]} list`,
	},
]

describe('checkHostContract over fixture records', () => {
	describe.each(VENDORS)('$label', (vendor) => {
		it.each(ROWS)('$label', (row) => {
			const findings = checkHostContract({
				calls: row.calls?.(vendor) ?? callsOf(vendor),
				contract: row.contract?.(vendor) ?? contractOf(vendor),
				impliedFlagsOf: vendor.impliedFlagsOf,
			})

			expect(findings.map((finding) => finding.kind)).toEqual(row.kinds)
			for (const finding of findings) {
				expect(finding.key).toBe(row.key?.(vendor))
				expect(finding.message).toContain('npm run host:refresh')
				expect(finding.message).toContain(finding.key)
			}
		})
	})
})

describe('checkHostContract over each committed record', () => {
	it.each(HOST_CONTRACTS.map((record) => ({ name: record.name, record })))(
		'$name → its table and its recorded description agree',
		({ record }) => {
			expect(
				checkHostContract({
					calls: record.calls,
					contract: record.contract,
					impliedFlagsOf: record.impliedFlagsOf,
				}),
			).toEqual([])
		},
	)
})
