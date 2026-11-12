/** The temporary data folder a `dialecte facts` test runs in. */
export type FactsWorkspace = {
	/** The scratch folder holding everything below. */
	base: string
	/** `XDG_DATA_HOME` of the command's environment. */
	dataHome: string
	/** The facts folder (`<dataHome>/dialecte/facts`), made when a fact is first recorded. */
	folder: string
	cwd: string
	environment: NodeJS.ProcessEnv
}
