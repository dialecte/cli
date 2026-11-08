/** A message template with each `{name}` replaced by its value. */
export function fillMessage(params: { template: string; values: Record<string, string> }): string {
	let message = params.template
	for (const [name, value] of Object.entries(params.values))
		message = message.replaceAll(`{${name}}`, value)
	return message
}
