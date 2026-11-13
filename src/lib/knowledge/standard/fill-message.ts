import { PLACEHOLDER_PATTERN } from './fill-message.constants.ts'

/**
 * A message template with each `{name}` replaced by its value, in one pass: a value is written as it is (no `$`
 * pattern expansion) and never filled again; a placeholder with no value stays as written.
 */
export function fillMessage(params: { template: string; values: Record<string, string> }): string {
	const { template, values } = params
	return template.replace(
		PLACEHOLDER_PATTERN,
		function valueOf(placeholder: string, name: string): string {
			return Object.hasOwn(values, name) ? values[name] : placeholder
		},
	)
}
