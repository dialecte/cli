/**
 * The type exports of `@dialecte/cli/lookups` the described element needs: what `describeElement` takes and
 * returns, and the description types `ElementDescription` is made of.
 */
export const LOOKUP_TYPE_EXPORTS: readonly string[] = [
	'AttributeDescription',
	'ChildDescription',
	'ElementDescription',
	'LoadedDialecte',
]

/** The functions the ask lot exports from the entry: each ships a JSDoc summary in the declaration file. */
export const LOOKUP_DOCUMENTED_FUNCTIONS: readonly string[] = [
	'findInStandard',
	'loadStandardIndexes',
]

/** The runtime exports of `@dialecte/cli/lookups`: what the MCP tools call. */
export const LOOKUP_EXPORTS: readonly string[] = [
	'answerMembers',
	'answerSchema',
	'describeElement',
	'findInStandard',
	'loadStandardIndexes',
	'packagesText',
	'readApiIndexes',
	'readCliVersion',
	'readMemberEntries',
	'readSchemaDialectes',
	'runApi',
	'runDoctor',
	'runModels',
]

/** The file of the consumer the declarations are type-checked with. */
export const LOOKUP_CONSUMER_FILE = 'consumer.ts'

/**
 * A program that serves the lookups: each answer is assigned to the exported `CommandOutput`. It names the
 * package as a consumer does (`@dialecte/cli/lookups`).
 */
export const LOOKUP_CONSUMER_SOURCE = `import type {
	CommandOutput,
	MemberEntriesRead,
	SchemaDialectesRead,
	answerMembers,
	answerSchema,
	runApi,
	runDoctor,
	runModels,
} from '@dialecte/cli/lookups'

type Answered<Lookup extends (...params: never[]) => unknown> = Awaited<ReturnType<Lookup>>

declare const api: Answered<typeof runApi>
declare const doctor: Answered<typeof runDoctor>
declare const models: Answered<typeof runModels>
declare const schema: Answered<typeof answerSchema>
declare const members: Answered<typeof answerMembers>
declare const schemaRead: Extract<SchemaDialectesRead, { kind: 'output' }>
declare const membersRead: Extract<MemberEntriesRead, { kind: 'output' }>

export const answers: CommandOutput[] = [
	api,
	doctor,
	models,
	schema,
	members,
	schemaRead.output,
	membersRead.output,
]
`
