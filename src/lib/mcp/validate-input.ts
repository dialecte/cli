import { OPTION_PREFIX } from './mcp-tools.constants.ts'

import type { McpToolDefinition } from './mcp.types.ts'

/** What is wrong with the input of a call against the tool's schema, or undefined. */
export function validateInput(params: {
	definition: McpToolDefinition
	input: Record<string, unknown>
}): string | undefined {
	const { definition, input } = params
	const { properties, required } = definition.inputSchema
	for (const name of Object.keys(input))
		if (!Object.hasOwn(properties, name)) return `${definition.name}: unknown argument "${name}"`
	for (const name of required)
		if (input[name] === undefined) return `${definition.name}: "${name}" is required`
	for (const [name, property] of Object.entries(properties)) {
		const value = input[name]
		if (value === undefined) continue
		if (property.type === 'integer') {
			if (
				!Number.isInteger(value) ||
				(property.minimum !== undefined && Number(value) < property.minimum)
			)
				return `${definition.name}: "${name}" must be an integer of at least ${property.minimum ?? 0}`
			continue
		}
		if (typeof value !== 'string' || value.trim() === '')
			return `${definition.name}: "${name}" must be a non-empty string`
		// the command line this shares would read it as an option
		if (name !== 'cwd' && value.startsWith(OPTION_PREFIX))
			return `${definition.name}: "${name}" must not start with "${OPTION_PREFIX}"`
	}
	return undefined
}
