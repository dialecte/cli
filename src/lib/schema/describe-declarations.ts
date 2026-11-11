import { describeDeclaration } from './describe-element.ts'
import { declarationParents } from './resolve-declaration.ts'

import type { DeclarationDescription, LoadedDialecte } from './schema.types.ts'

/**
 * Every way a tag is declared in a dialecte: each declaration's key, the parents that hold it, whether it is
 * global, and what it describes. A tag declared once gives an empty list. `ids` keeps only those declarations,
 * filtered before any is described.
 *
 * @intent list the declarations of a tag, tell what each way of declaring a tag allows
 */
export function describeDeclarations(params: {
	dialecte: LoadedDialecte
	tagName: string
	/** The keys of the declarations to describe; every declaration when undefined. */
	ids?: readonly string[] | undefined
}): DeclarationDescription[] {
	const { dialecte, tagName, ids } = params
	const { definition, elements } = dialecte.config
	const declarations = elements.includes(tagName) ? definition[tagName]?.declarations : undefined
	const kept = Object.entries(declarations ?? {}).filter(
		([id]) => ids === undefined || ids.includes(id),
	)
	return kept.flatMap(function describeWay([id, declaration]) {
		const element = describeDeclaration({ dialecte, tagName, id })
		if (element === undefined) return []
		return [
			{
				id,
				parents: declarationParents({ definition, tagName, id }),
				global: declaration.global === true,
				element,
			},
		]
	})
}
