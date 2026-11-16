export type TwiceTestParams = { imports: string[]; names: string[] }

export type RunRulesJsonParams = {
	files: Record<string, string>
	file: string
	/** Pass the file to `rules` as an absolute path under the scratch repository. */
	absolute?: boolean
}

export type LineOfParams = { text: string; needle: string }
