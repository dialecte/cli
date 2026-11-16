import type ts from 'typescript'

/** A variable declaration whose name is one identifier (`const start = ...`), not a destructuring pattern. */
export type NamedVariableDeclaration = ts.VariableDeclaration & { name: ts.Identifier }
