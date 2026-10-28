import { MCP_TOOL_RUNS } from './mcp-tool-runs.constants.ts'
import { ANSWERING_EXIT_CODES, MCP_TOOLS } from './mcp-tools.constants.ts'
import { resolveCwd } from './resolve-cwd.ts'
import { validateInput } from './validate-input.ts'

import type { McpServerContext, McpToolResult } from './mcp.types.ts'

/** The answer of one tool call: the command's JSON, or, when it did not answer, its readable text flagged as an error. */
export async function callTool(params: {
	name: string
	input: Record<string, unknown>
	context: McpServerContext
}): Promise<McpToolResult> {
	const { name, input, context } = params
	const definition = MCP_TOOLS.find((tool) => tool.name === name)
	if (!definition)
		return errorResult(`unknown tool "${name}": ${MCP_TOOLS.map((tool) => tool.name).join(', ')}`)

	const invalid = validateInput({ definition, input })
	if (invalid) return errorResult(invalid)
	const folder = resolveCwd({ cwd: input.cwd, serverCwd: context.serverCwd })
	if (folder.kind === 'error') return errorResult(folder.message)

	// one run: a command that throws (a corrupt index, an unbuilt package) answers its message
	try {
		const answer = await MCP_TOOL_RUNS[definition.name]({ input, cwd: folder.cwd, context })
		if ((ANSWERING_EXIT_CODES[definition.name] ?? [0]).includes(answer.json.exitCode))
			return { content: [{ type: 'text', text: answer.json.output }], isError: false }
		return errorResult(answer.readable().output)
	} catch (error) {
		return errorResult(error instanceof Error ? error.message : String(error))
	}
}

function errorResult(text: string): McpToolResult {
	return { content: [{ type: 'text', text }], isError: true }
}
