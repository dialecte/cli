/** A fake editor that stays running until released. */
export type BlockingEditor = FakeEditorFolder & {
	/** The file holding the editor's process id once it runs. */
	pidFile: string
	/** Creating this file lets the editor end. */
	releaseFile: string
	/** The editor's executable. */
	executable: string
}

/** A scratch folder holding fake editors: executables that record the arguments they were started with. */
export type FakeEditorFolder = {
	/** The folder: one entry of a scratch `PATH`. */
	folder: string
	/** Where the fake editor `word` records its arguments (one per line), once it has run. */
	recordOf: (word: string) => string
}
