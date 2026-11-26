/** Why a file of the orchestrator folder could not be read, in a few stable words: `is a directory`, else the error. */
export function orchestratorReadFailure(error: unknown): string {
	if ((error as NodeJS.ErrnoException).code === 'EISDIR') return 'is a directory'
	return error instanceof Error ? error.message : String(error)
}
