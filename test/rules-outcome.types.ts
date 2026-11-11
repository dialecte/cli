/** What a run answered, or that it threw (a crash is no error line). */
export type RulesOutcome =
	| { threw: false; exitCode: number; output: string }
	| { threw: true; message: string }
