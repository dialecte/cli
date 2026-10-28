/**
 * `dialecte mcp` - the read-only lookups (api find / show, schema, members, doctor, models) as the tools of a
 * stdio MCP server, for an agent host that prefers tools to a shell. Each tool answers what its command
 * answers with `--json`; the write and process commands stay on the command line.
 */
import { readCliVersion } from '../lib/read-cli-version.ts'

export async function run(): Promise<void> {
	// imported here: the other commands never load the server or the SDK
	const { createMcpServer } = await import('../lib/mcp/create-mcp-server.ts')
	const { redirectConsoleToStderr } = await import('../lib/mcp/redirect-console.ts')
	const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
	redirectConsoleToStderr()
	const server = await createMcpServer({
		context: {
			serverCwd: process.cwd(),
			cliVersion: readCliVersion(),
			dialecteRoot: process.env.DIALECTE_ROOT,
		},
	})
	await server.connect(new StdioServerTransport())
}
