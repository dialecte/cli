/** The namespace a package's types hydrate under: its name without the scope, capitalized (`@dialecte/scl` → `Scl`). */
export function namespaceOf(packageName: string): string {
	const name = packageName.split('/').pop() || 'dialecte'
	return name.charAt(0).toUpperCase() + name.slice(1)
}
