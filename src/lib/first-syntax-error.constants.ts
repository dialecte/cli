import ts from 'typescript'

/** The options of the one-file program a syntax check builds: no library, no import followed, any extension read. */
export const SYNTAX_CHECK_OPTIONS: ts.CompilerOptions = {
	noLib: true,
	noResolve: true,
	isolatedModules: true,
	allowNonTsExtensions: true,
	target: ts.ScriptTarget.Latest,
}
