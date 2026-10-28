import { callTool } from './call-tool.ts'
import { MCP_SERVER_NAME, MCP_TOOLS } from './mcp-tools.constants.ts'

import type { McpServerContext } from './mcp.types.ts'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'

/**
 * The server: `tools/list` names the lookups, `tools/call` answers one through the command's own answer function.
 *
 * It uses the SDK's low-level `Server` on purpose: the high-level `McpServer.registerTool` takes zod schemas,
 * and zod is the SDK's dependency, not the cli's: importing it here would tie the cli to the version the SDK
 * resolves. The tool inputs are plain JSON Schema constants, validated by `validateInput`, which is all the
 * low-level `Server` needs. The SDK is imported here, when a server is made, so a command
 * that is not `mcp` never loads it.
 */
export async function createMcpServer(params: { context: McpServerContext }): Promise<Server> {
	const { Server: McpServer } = await import('@modelcontextprotocol/sdk/server/index.js')
	const { CallToolRequestSchema, ListToolsRequestSchema } =
		await import('@modelcontextprotocol/sdk/types.js')
	const server = new McpServer(
		{ name: MCP_SERVER_NAME, version: params.context.cliVersion },
		{ capabilities: { tools: {} } },
	)
	server.setRequestHandler(ListToolsRequestSchema, async function listTools() {
		return { tools: [...MCP_TOOLS] }
	})
	server.setRequestHandler(CallToolRequestSchema, async function runTool(request) {
		return callTool({
			name: request.params.name,
			input: request.params.arguments ?? {},
			context: params.context,
		})
	})
	return server
}
