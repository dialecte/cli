import type { RuleFinding } from './check-code-rules.types.ts'
import type ts from 'typescript'

/** A finding of a quality rule, before the file is added. */
export type QualityFinding = Omit<RuleFinding, 'file'>

/** The function a parameter belongs to, as its findings name and place it. */
export type FunctionOwner = {
	name: string
	/** The 1-based line of the function's first token. */
	functionLine: number
	/** Where the function starts in the file: tells two owners of the same name apart. */
	start: number
}

/** What a name refers to in a scope: a parameter of `owner` (or a binding taken from one), or a local value. */
export type Binding = { owner: FunctionOwner | undefined }

/** The names one block, function, loop or catch clause declares, inside the scope around it. */
export type Scope = {
	bindings: ReadonlyMap<string, Binding>
	parent: Scope | undefined
}

/** `params.state.items` as its root name and the segments after it (an index that is not a literal has no name). */
export type TargetPath = {
	root: ts.Identifier
	segments: readonly (string | undefined)[]
}

/** A change of what `path` refers to, at `node`, labelled as the message says it (`.add`, `=`, `delete`). */
export type Mutation = {
	node: ts.Node
	path: TargetPath
	label: string
}

/** A mutation of a parameter, with the function the parameter belongs to. */
export type OwnedMutation = {
	owner: FunctionOwner
	mutation: Mutation
}
