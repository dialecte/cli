/** A way `--out` reaches a dangling link: its title and the word given, from the link's path. */
export type OutRow = {
	title: string
	word: (link: string) => string
}
