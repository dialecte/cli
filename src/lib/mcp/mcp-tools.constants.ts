import type { McpInputProperty, McpToolDefinition, McpToolName } from './mcp.types.ts'

export const MCP_SERVER_NAME = 'dialecte'

const CWD_PROPERTY: McpInputProperty = {
	type: 'string',
	description:
		"The package folder to read (its package.json is there); default: the server's working folder.",
}

function textProperty(description: string): McpInputProperty {
	return { type: 'string', description }
}

const PACKAGE_PROPERTY = textProperty('Only this installed package, e.g. "@dialecte/scl".')

/** The six read-only lookups, each answering what the matching `dialecte` command answers with `--json`. */
export const MCP_TOOLS: readonly McpToolDefinition[] = [
	{
		name: 'api_find',
		description:
			'Find a Dialecte method by what you need to do: the methods whose intents, summary or name match the need, best first.',
		inputSchema: {
			type: 'object',
			properties: {
				need: textProperty('What you need, in words, e.g. "copy an element with its children".'),
				package: PACKAGE_PROPERTY,
				limit: {
					type: 'integer',
					minimum: 1,
					description: 'How many methods at most (default 5).',
				},
				cwd: CWD_PROPERTY,
			},
			required: ['need'],
			additionalProperties: false,
		},
	},
	{
		name: 'api_show',
		description:
			'Read the contract of one method: signature, summary, intents, other routes, declaration and an example.',
		inputSchema: {
			type: 'object',
			properties: {
				path: textProperty('The method path, e.g. "info.of" or "tx.reference.applyUuidRemap".'),
				cwd: CWD_PROPERTY,
			},
			required: ['path'],
			additionalProperties: false,
		},
	},
	{
		name: 'schema',
		description:
			'What an element may hold and where: parents, children in order with how often, attributes, text. An unknown tag answers the closest tag names.',
		inputSchema: {
			type: 'object',
			properties: {
				tag: textProperty('The element tag name, e.g. "Bay".'),
				package: PACKAGE_PROPERTY,
				cwd: CWD_PROPERTY,
			},
			required: ['tag'],
			additionalProperties: false,
		},
	},
	{
		name: 'members',
		description:
			'The members of an expression of the live types (doc.query, doc.query.reference, tx.lifecycle.extract), one per line with its summary.',
		inputSchema: {
			type: 'object',
			properties: {
				expression: textProperty('The expression to walk, e.g. "doc.query".'),
				namespace: textProperty(
					'Only in an application (not a dialecte package): the name of the dialecte namespace its types are in, e.g. "Scl"; give it with entry.',
				),
				entry: textProperty(
					'Only in an application: the module that exports that namespace, e.g. "@dialecte/scl" or "./src/dialecte".',
				),
				cwd: CWD_PROPERTY,
			},
			required: ['expression'],
			additionalProperties: false,
		},
	},
	{
		name: 'doctor',
		description:
			'Installed @dialecte/* versions, the core API generation, whether the agent skills follow node_modules, local checkouts: what to fix before trusting what you read.',
		inputSchema: {
			type: 'object',
			properties: { cwd: CWD_PROPERTY },
			required: [],
			additionalProperties: false,
		},
	},
	{
		name: 'models',
		description:
			'Which model each tier (fast, standard, strong, frontier) means for the vendor of the project.',
		inputSchema: {
			type: 'object',
			properties: {
				vendor: textProperty(
					'anthropic, openai or google; default: the vendor the project remembers.',
				),
				cwd: CWD_PROPERTY,
			},
			required: [],
			additionalProperties: false,
		},
	},
]

/** A value starting with this would be read as an option by the command line the tool shares. */
export const OPTION_PREFIX = '--'

/** `doctor` exits 1 on a warning: that is an answer, not a failure of the call. */
export const ANSWERING_EXIT_CODES: Partial<Record<McpToolName, readonly number[]>> = {
	doctor: [0, 1],
}
