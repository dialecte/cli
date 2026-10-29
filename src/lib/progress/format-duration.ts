/** A duration as the progress lines print it: `0.4 s`, `42 s`, `2 m 10 s`, `1 h 5 m`. */
export function formatDuration(milliseconds: number): string {
	const seconds = milliseconds / 1000
	if (seconds < 10) return `${seconds.toFixed(1)} s`
	if (seconds < 60) return `${Math.floor(seconds)} s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes} m ${Math.floor(seconds % 60)} s`
	return `${Math.floor(minutes / 60)} h ${minutes % 60} m`
}
