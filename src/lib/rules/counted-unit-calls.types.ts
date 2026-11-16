import type ts from 'typescript'

/** A node whose parts run one of several arms: the parts that always run, and the arms of which one runs. */
export type ExclusiveArms = {
	/** The parts that always run, in source order (the condition, the switch value). */
	shared: ts.Node[]
	/** The arms of which at most one runs (`if` / `else`, the two sides of `?:`, the `switch` clauses). */
	arms: ts.Node[]
}
