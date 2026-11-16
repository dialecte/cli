import type ts from 'typescript'

/**
 * A body that runs with the instance as `this`: a method's or an accessor's, or an arrow's that the constructor or a
 * field initializer creates.
 */
export type ClassMember = {
	/** The member's name as written (`add`, `#items`, `[key]`), `constructor` for the constructor. */
	name: string
	/** The member it belongs to: its first token, decorators included, is where an opt-out before it applies. */
	member: ts.ClassElement
	body: ts.Node
}
