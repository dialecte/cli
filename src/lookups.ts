/**
 * `@dialecte/cli/lookups` - the library entry: the pure answer functions of the read-only lookups (api, schema,
 * members, doctor, models), for a program that serves them in another form (`@dialecte/mcp`). Each answers what
 * its command prints, as text and an exit code; none reads the command line or exits the process. The schema
 * description itself (`describeElement`: what an element may hold and where, as data) is exported beside them.
 */
export { packagesText, runApi } from './commands/api.ts'
export { runDoctor } from './commands/doctor.ts'
export { readMemberEntries } from './commands/members.ts'
export { runModels } from './commands/models.ts'
export { readSchemaDialectes } from './commands/schema.ts'
export { answerMembers } from './lib/api/answer-members.ts'
export { readApiIndexes } from './lib/api/read-api-indexes.ts'
export { readCliVersion } from './lib/read-cli-version.ts'
export { answerSchema } from './lib/schema/answer-schema.ts'
export { describeElement } from './lib/schema/describe-element.ts'

export type { MemberEntriesRead } from './commands/members.types.ts'
export type { SchemaDialectesRead } from './commands/schema.types.ts'
export type {
	ApiExportedFunction,
	ApiJson,
	ApiMethod,
	ApiMethodFields,
	ApiRootMethod,
} from './lib/api/api-json.types.ts'
export type { LookupOutput as CommandOutput } from './lib/command-output.types.ts'
export type { PrintedText } from './lib/print/print.types.ts'
export type {
	AttributeDescription,
	ChildDescription,
	ElementDescription,
	LoadedDialecte,
} from './lib/schema/schema.types.ts'
