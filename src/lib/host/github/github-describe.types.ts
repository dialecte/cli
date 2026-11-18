/** What the help parser reads out of a `gh` help text. */
import type { HostFlagAlias } from '../host.types.ts'

/** The flags a help lists: every form, in the order printed (a short form before its long), and the alias pairs. */
export type HelpFlags = { flags: string[]; aliases: HostFlagAlias[] }

/** A type reference of an introspection answer: a named type, or a wrapper (list, non-null) around one. */
export type IntrospectedTypeRef = { name: string | null; ofType?: IntrospectedTypeRef | null }

/** One field of an introspection answer. */
export type IntrospectedField = {
	name: string
	args: readonly { name: string }[]
	type: IntrospectedTypeRef
}

/** The answer of `gh api graphql` to the introspection of one type (`__type` null for a type the schema lacks). */
export type IntrospectionAnswer = {
	data?: { __type?: { name: string; fields: readonly IntrospectedField[] | null } | null }
}
