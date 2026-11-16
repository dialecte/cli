import { ANONYMOUS_CLASS_NAME } from './check-class-rules.constants.ts'

import ts from 'typescript'

/** Its own name, the name of the variable holding it (`const Store = class {}`), else `default`. */
export function classNameOf(node: ts.ClassLikeDeclaration): string {
	if (node.name) return node.name.text
	const holder = node.parent
	if (ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name)) return holder.name.text
	return ANONYMOUS_CLASS_NAME
}
