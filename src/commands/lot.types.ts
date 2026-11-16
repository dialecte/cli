/** The question of `lot start`'s effort: the prompt it prints, the answer line it reads (without its newline). */
export type AskFunction = (params: { prompt: string }) => Promise<string>

/** What the one async entry of `dialecte lot` takes: the words, the folder, whether stdin and stdout are both terminals, the question. */
export type RunLotCommandParams = {
	argv: string[]
	cwd: string
	isTerminal: boolean
	ask: AskFunction
	now?: Date
	/** The cli named in `lot result`'s card when the repository's own cannot run hand-overs. */
	cliPath?: string
}

/** The lists of the lot file an entry can be removed from (`lot <list> --remove <entry>`). */
export type RemovableList = 'accept' | 'revised' | 'gone' | 'moved'
