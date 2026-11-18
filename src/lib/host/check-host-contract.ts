/** The offline check of a vendor's call table against what its tool was recorded to describe. */
import { HOST_REFRESH_HINT } from './check-host-contract.constants.ts'
import { GRAPHQL_ROOT_TYPE } from './graphql-selections.constants.ts'
import { selectionsOf } from './graphql-selections.ts'

import type {
	HostCallSpec,
	HostCallTable,
	HostContract,
	HostContractCommand,
	HostFinding,
	HostFindingKind,
	HostFlagAlias,
} from './host.types.ts'

/**
 * Every finding between `calls` and `contract`: a command, flag, field, GraphQL field or argument the record lacks, a
 * recorded command lacking a flag its spec implies (the flag or its recorded alias counts), an implied flag written
 * into an entry's `flags`, and a recorded command no entry uses. Each names the table key and says to run
 * `npm run host:refresh`.
 *
 * @intent prove offline that every call the cli declares exists in the tool's recorded description
 * @internal
 */
export function checkHostContract(params: {
	calls: HostCallTable
	contract: HostContract
	impliedFlagsOf(spec: HostCallSpec): string[]
}): HostFinding[] {
	const { calls, contract, impliedFlagsOf } = params
	const entryFindings = Object.entries(calls).flatMap(function findingsOfEntry([key, spec]) {
		return entryFindingsOf({
			key,
			spec,
			contract,
			implied: impliedFlagNamesOf({ spec, impliedFlagsOf }),
		})
	})
	const used = new Set(
		Object.values(calls).map(function pathOfSpec(spec) {
			return commandPathOf({ words: spec.words })
		}),
	)
	const staleFindings = Object.keys(contract.commands).flatMap(function staleOf(path) {
		return used.has(path)
			? []
			: [findingOf({ kind: 'stale', key: path, detail: 'is recorded but no call uses it' })]
	})
	return [...entryFindings, ...staleFindings]
}

/**
 * The type a GraphQL selection's `path` reaches from the root type, walking each field's recorded type; undefined
 * when a field on the way, or a type it passes through, is not recorded.
 *
 * @intent resolve a selection type by type from the root, for the check and the refresh alike
 * @internal
 */
export function graphqlTypeAt(params: {
	graphql: HostContract['graphql']
	path: readonly string[]
}): string | undefined {
	return params.path.reduce<string | undefined>(function stepInto(type, field) {
		if (type === undefined) return undefined
		return params.graphql[type]?.[field]?.type
	}, GRAPHQL_ROOT_TYPE)
}

/** The command path a call's words name (`"pr view"`), as the record keys its commands. */
export function commandPathOf(params: { words: readonly string[] }): string {
	return params.words.join(' ')
}

/** The flags (not their values) a spec implies, as its vendor's `impliedFlagsOf` writes them into argv. */
function impliedFlagNamesOf(params: {
	spec: HostCallSpec
	impliedFlagsOf(spec: HostCallSpec): string[]
}): string[] {
	return params.impliedFlagsOf(params.spec).filter(function isFlag(word) {
		return word.startsWith('-')
	})
}

/** One entry's findings: its command, then its flags, its fields, its implied flags and its GraphQL selections. */
function entryFindingsOf(params: {
	key: string
	spec: HostCallSpec
	contract: HostContract
	implied: readonly string[]
}): HostFinding[] {
	const { key, spec, contract, implied } = params
	const path = commandPathOf({ words: spec.words })
	const command = contract.commands[path]
	if (!command) {
		return [
			findingOf({ kind: 'unknown-command', key, detail: `\`${path}\` is not a recorded command` }),
		]
	}
	return [
		...flagFindingsOf({ key, spec, path, command, implied }),
		...fieldFindingsOf({ key, spec, path, command }),
		...impliedFindingsOf({ key, path, command, implied }),
		...graphqlFindingsOf({ key, spec, contract }),
	]
}

/** An entry flag that is implied (itself or through its alias), or that the command does not have. */
function flagFindingsOf(params: {
	key: string
	spec: HostCallSpec
	path: string
	command: HostContractCommand
	implied: readonly string[]
}): HostFinding[] {
	const { key, spec, path, command, implied } = params
	return spec.flags.flatMap(function findingOfFlag(flag) {
		const impliedAs = implied.find(function isImpliedForm(each) {
			return each === flag || aliasOf({ flag: each, aliases: command.aliases }) === flag
		})
		if (impliedAs !== undefined) {
			return [
				findingOf({
					kind: 'implied-flag-in-flags',
					key,
					detail: `the flag ${flag} is implied by the spec (${impliedAs}); remove it from its flags`,
				}),
			]
		}
		return command.flags.includes(flag)
			? []
			: [findingOf({ kind: 'unknown-flag', key, detail: `\`${path}\` has no flag ${flag}` })]
	})
}

/** An entry field the command does not list. */
function fieldFindingsOf(params: {
	key: string
	spec: HostCallSpec
	path: string
	command: HostContractCommand
}): HostFinding[] {
	const { key, spec, path, command } = params
	return (spec.fields ?? []).flatMap(function findingOfField(field) {
		return command.fields?.includes(field)
			? []
			: [findingOf({ kind: 'unknown-field', key, detail: `\`${path}\` lists no field ${field}` })]
	})
}

/** An implied flag the command has in neither of its forms. */
function impliedFindingsOf(params: {
	key: string
	path: string
	command: HostContractCommand
	implied: readonly string[]
}): HostFinding[] {
	const { key, path, command, implied } = params
	return implied.flatMap(function findingOfImplied(flag) {
		const alias = aliasOf({ flag, aliases: command.aliases })
		const recorded =
			command.flags.includes(flag) || (alias !== undefined && command.flags.includes(alias))
		return recorded
			? []
			: [
					findingOf({
						kind: 'missing-implied-flag',
						key,
						detail: `\`${path}\` has no flag ${flag}, which the spec implies`,
					}),
				]
	})
}

/** A GraphQL field its type does not have, or an argument its field does not take, resolved from the root type. */
function graphqlFindingsOf(params: {
	key: string
	spec: HostCallSpec
	contract: HostContract
}): HostFinding[] {
	const { key, spec, contract } = params
	if (spec.graphql === undefined) return []
	const selections = selectionsOf({ query: spec.graphql })
	if ('refusal' in selections) {
		return [findingOf({ kind: 'unknown-graphql-field', key, detail: selections.refusal })]
	}
	return selections.flatMap(function findingsOfSelection(selection) {
		const parent = graphqlTypeAt({ graphql: contract.graphql, path: selection.path })
		// a field on the way that is not recorded is found once, at that field
		if (parent === undefined) return []
		const field = contract.graphql[parent]?.[selection.field]
		if (!field) {
			return [
				findingOf({
					kind: 'unknown-graphql-field',
					key,
					detail: `the GraphQL type ${parent} has no recorded field ${selection.field}`,
				}),
			]
		}
		return selection.args.flatMap(function findingOfArg(arg) {
			return field.args.includes(arg)
				? []
				: [
						findingOf({
							kind: 'unknown-graphql-argument',
							key,
							detail: `the GraphQL field ${parent}.${selection.field} takes no argument ${arg}`,
						}),
					]
		})
	})
}

/** The other form of `flag` among the command's recorded pairs, or undefined when it has none. */
function aliasOf(params: { flag: string; aliases: readonly HostFlagAlias[] }): string | undefined {
	const pair = params.aliases.find(function isPairOf(alias) {
		return alias.short === params.flag || alias.long === params.flag
	})
	if (!pair) return undefined
	return pair.short === params.flag ? pair.long : pair.short
}

/** A finding naming its key, what is wrong, and how the record is read again. */
function findingOf(params: { kind: HostFindingKind; key: string; detail: string }): HostFinding {
	return {
		kind: params.kind,
		key: params.key,
		message: `${params.key}: ${params.detail}; ${HOST_REFRESH_HINT}`,
	}
}
