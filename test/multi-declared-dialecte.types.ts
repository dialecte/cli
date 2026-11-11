import type { ElementDefinition } from '@dialecte/core'

/** What the fixture replaces in core's test config, as plain data (the install writes it into a module). */
export type MultiDeclaredPatch = {
	elements: string[]
	parents: Record<string, readonly string[]>
	children: Record<string, readonly string[]>
	definition: Record<string, ElementDefinition>
}
