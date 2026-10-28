import { packagesText, runApi } from '../../commands/api.ts'
import { runDoctor } from '../../commands/doctor.ts'
import { readMemberEntries } from '../../commands/members.ts'
import { runModels } from '../../commands/models.ts'
import { readSchemaDialectes } from '../../commands/schema.ts'
import { answerMembers } from '../api/answer-members.ts'
import { readApiIndexes } from '../api/read-api-indexes.ts'
import { missingPackage } from '../missing-package.ts'
import { answerSchema } from '../schema/answer-schema.ts'

import type { CommandOutput } from '../command-output.types.ts'
import type { McpToolAnswer, McpToolName, McpToolRun } from './mcp.types.ts'

const JSON_FLAG = ['--json']

function optionFor(params: { input: Record<string, unknown>; name: string }): string[] {
	const value = params.input[params.name]
	return value === undefined ? [] : [`--${params.name}`, String(value)]
}

/** An answer whose readable form is its own output, except that "nothing found" (exit 1) says `hint`. */
function answerWithHint(params: { json: CommandOutput; hint: () => string }): McpToolAnswer {
	const { json, hint } = params
	return {
		json,
		readable: () => (json.exitCode === 1 ? { output: `${hint()}\n`, exitCode: 1 } : json),
	}
}

function optionalText(value: unknown): string | undefined {
	return value === undefined ? undefined : String(value)
}

/** Where a not-found api lookup searched: the installed packages shipping an index (those the filter keeps). */
function searchedText(params: { cwd: string; packageName?: string }): string {
	const indexes = readApiIndexes({ cwd: params.cwd })
	const searched = indexes.filter(
		(index) => params.packageName === undefined || index.package === params.packageName,
	)
	return params.packageName !== undefined && searched.length === 0
		? `no installed package "${params.packageName}" (installed: ${indexes.map((index) => index.package).join(', ') || 'none'})`
		: `in ${packagesText(searched)}`
}

function answerAsIs(json: CommandOutput): McpToolAnswer {
	return { json, readable: () => json }
}

/** Each tool runs the answer function of its command, with the argument list the command line would build. */
export const MCP_TOOL_RUNS: Record<McpToolName, McpToolRun> = {
	api_find: function runApiFind({ input, cwd }) {
		const json = runApi({
			argv: [
				'find',
				String(input.need),
				...optionFor({ input, name: 'package' }),
				...optionFor({ input, name: 'limit' }),
				...JSON_FLAG,
			],
			cwd,
		})
		return answerWithHint({
			json,
			hint: () =>
				`${searchedText({ cwd, packageName: optionalText(input.package) })}: no method found for "${String(input.need)}" - try other words, or the members tool for the live types`,
		})
	},
	api_show: function runApiShow({ input, cwd }) {
		const json = runApi({ argv: ['show', String(input.path), ...JSON_FLAG], cwd })
		return answerWithHint({
			json,
			hint: () =>
				`${searchedText({ cwd })}: no method "${String(input.path)}" - the api_find tool lists the routes`,
		})
	},
	schema: async function runSchemaTool({ input, cwd }) {
		const argv = [String(input.tag), ...optionFor({ input, name: 'package' })]
		const read = await readSchemaDialectes({ argv, cwd })
		if (read.kind === 'output') return answerAsIs(read.output)
		const { loaded, tagName, packageName, installed } = read
		return {
			json: answerSchema({ loaded, tagName, json: true }),
			// the closest names need the loaded dialectes: the same load, rendered as text
			readable: () =>
				packageName !== undefined && loaded.dialectes.length === 0
					? {
							output: `no installed dialecte package "${packageName}" (installed: ${installed.join(', ') || 'none'})\n`,
							exitCode: 1,
						}
					: answerSchema({ loaded, tagName, json: false }),
		}
	},
	members: function runMembersTool({ input, cwd }) {
		const argv = [
			String(input.expression),
			...optionFor({ input, name: 'namespace' }),
			...optionFor({ input, name: 'entry' }),
		]
		const read = readMemberEntries({ argv, cwd })
		if (read.kind === 'output') return answerAsIs(read.output)
		const { entries, expression } = read
		return {
			json: answerMembers({ entries, expression, json: true }),
			readable: () => answerMembers({ entries, expression, json: false }),
		}
	},
	doctor: function runDoctorTool({ cwd, context }) {
		return answerAsIs(
			runDoctor({
				argv: JSON_FLAG,
				cwd,
				dialecteRoot: context.dialecteRoot,
				cliVersion: context.cliVersion,
			}),
		)
	},
	models: function runModelsTool({ input, cwd }) {
		return answerAsIs(
			runModels({ argv: [...optionFor({ input, name: 'vendor' }), ...JSON_FLAG], cwd }),
		)
	},
}
