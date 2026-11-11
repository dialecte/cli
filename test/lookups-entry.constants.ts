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

/** The runtime exports of `@dialecte/cli/lookups`: what the MCP tools call. */
export const LOOKUP_EXPORTS: readonly string[] = [
	'answerMembers',
	'answerSchema',
	'describeElement',
	'packagesText',
	'readApiIndexes',
	'readCliVersion',
	'readMemberEntries',
	'readSchemaDialectes',
	'runApi',
	'runDoctor',
	'runModels',
]
