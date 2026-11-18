/** The readers of what `gh` describes of itself. */
import {
	HELP_FLAG_LINE,
	HELP_FLAG_SECTIONS,
	INTROSPECTED_TYPE_SELECTION,
	JSON_FIELD_LINE,
	VERSION_PATTERN,
} from './github-describe.constants.ts'

import type { HostFlagAlias, HostGraphqlField } from '../host.types.ts'
import type {
	HelpFlags,
	IntrospectedField,
	IntrospectedTypeRef,
	IntrospectionAnswer,
} from './github-describe.types.ts'

/**
 * The flags of a help text, from its flag sections only (gh's `FLAGS` and `INHERITED FLAGS`, cobra's `Flags:`): short
 * and long forms, the argument names and the `[=true|false]` suffixes stripped, the alias pairs recorded.
 */
export function flagsOfHelp(params: { text: string }): HelpFlags {
	const lines = params.text.split(/\r?\n/)
	const flags: string[] = []
	const aliases: HostFlagAlias[] = []
	let inSection = false
	for (const line of lines) {
		if (isFlagSection({ line })) {
			inSection = true
			continue
		}
		// a section ends at its first blank or unindented line
		if (line.trim() === '' || !/^\s/.test(line)) {
			inSection = false
			continue
		}
		const match = inSection ? HELP_FLAG_LINE.exec(line) : null
		if (!match) continue
		const [, short, long] = match
		if (short) {
			flags.push(short)
			aliases.push({ short, long })
		}
		flags.push(long)
	}
	return { flags, aliases }
}

/** Whether a line is the heading of a flag section. */
function isFlagSection(params: { line: string }): boolean {
	const heading = params.line.trimEnd()
	return HELP_FLAG_SECTIONS.some(function isHeading(section) {
		return section === heading
	})
}

/** The fields of the list `gh <words> --json` prints (one indented name per line, after its heading line). */
export function fieldsOfJsonList(params: { text: string }): string[] {
	return params.text.split(/\r?\n/).flatMap(function fieldOfLine(line) {
		const match = JSON_FIELD_LINE.exec(line)
		return match?.[1] === undefined ? [] : [match[1]]
	})
}

/** The introspection query of one type: its fields, each with its argument names and its type unwrapped. */
export function introspectionQueryOf(params: { name: string }): string {
	return `{__type(name:${JSON.stringify(params.name)})${INTROSPECTED_TYPE_SELECTION}}`
}

/** The fields of an introspection answer by name, or undefined when it names no type (or is no answer). */
export function fieldsOfIntrospection(params: {
	text: string
}): Record<string, HostGraphqlField> | undefined {
	const answer = parsedIntrospection({ text: params.text })
	const fields = answer?.data?.__type?.fields
	if (!fields) return undefined
	return Object.fromEntries(
		fields.map(function entryOfField(field: IntrospectedField) {
			return [
				field.name,
				{
					type: namedTypeOf({ ref: field.type }),
					args: field.args.map(function nameOfArg(arg) {
						return arg.name
					}),
				},
			]
		}),
	)
}

/** The answer as JSON, or undefined when it is not JSON. */
function parsedIntrospection(params: { text: string }): IntrospectionAnswer | undefined {
	try {
		const parsed: unknown = JSON.parse(params.text)
		return typeof parsed === 'object' && parsed !== null
			? (parsed as IntrospectionAnswer)
			: undefined
	} catch {
		return undefined
	}
}

/** The named type under a reference's list and non-null wrappers. */
function namedTypeOf(params: { ref: IntrospectedTypeRef }): string {
	const { ref } = params
	if (ref.name !== null) return ref.name
	return ref.ofType ? namedTypeOf({ ref: ref.ofType }) : ''
}

/** The version a `--version` answer prints, or undefined when it prints none. */
export function versionOfText(params: { text: string }): string | undefined {
	return VERSION_PATTERN.exec(params.text)?.[1]
}
