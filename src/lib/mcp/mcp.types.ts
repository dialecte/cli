import type { CommandOutput } from '../command-output.types.ts'

/** The tools `dialecte mcp` serves: the read-only lookups, one tool each. */
export type McpToolName = 'api_find' | 'api_show' | 'schema' | 'members' | 'doctor' | 'models'

/** One property of a tool's input, as the JSON Schema the client reads. */
export type McpInputProperty = {
	type: 'string' | 'integer'
	description: string
	minimum?: number
}

export type McpToolDefinition = {
	name: McpToolName
	description: string
	inputSchema: {
		type: 'object'
		properties: Record<string, McpInputProperty>
		required: string[]
		additionalProperties: false
	}
}

/** What a tool call answers: the text of the answer, flagged when it is an error. */
export type McpToolResult = {
	content: { type: 'text'; text: string }[]
	isError: boolean
}

/** What the server knows of the process it runs in. */
export type McpServerContext = {
	/** The working folder of a call that gives no `cwd`. */
	serverCwd: string
	cliVersion: string
	/** `$DIALECTE_ROOT`: where the local checkouts live. */
	dialecteRoot: string | undefined
}

/** One run of a command: its JSON answer, and the readable form of it for an error, from the same run. */
export type McpToolAnswer = {
	json: CommandOutput
	readable: () => CommandOutput
}

/** One tool's run: the answer function of its command, called with the argument list the command line would build. */
export type McpToolRun = (params: {
	input: Record<string, unknown>
	cwd: string
	context: McpServerContext
}) => McpToolAnswer | Promise<McpToolAnswer>

export type McpResolvedCwd = { kind: 'folder'; cwd: string } | { kind: 'error'; message: string }
