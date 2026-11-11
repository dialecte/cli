/** A git common folder (real path) holding `dialecte-lots/` with one lot folder, and where the lots moved aside go. */
export type AsideWorkspace = {
	common: string
	lotFolder: string
	aside: string
}
