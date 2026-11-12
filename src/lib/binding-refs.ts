/** The type expressions a generated probe writes for a binding: a dialecte's namespace, or core with a config type. */
import type { Binding } from './config.types.ts'

export function refsOf(binding: Binding) {
	if (binding.kind === 'namespace') {
		return {
			imports: [`import type { ${binding.name} } from '${binding.import}'`],
			elementsOf: `${binding.name}.ElementsOf`,
			query: `${binding.name}.Query`,
			transaction: `${binding.name}.Transaction`,
			generic: (genericName: string, element: string) =>
				`${binding.name}.${genericName}<${element}>`,
			nullary: (typeName: string) => `${binding.name}.${typeName}`,
		}
	}
	return {
		imports: [
			`import type * as ${binding.coreAlias} from '${binding.coreImport}'`,
			`import type { ${binding.configType} } from '${binding.configImport}'`,
		],
		elementsOf: `${binding.coreAlias}.ElementsOf<${binding.configType}>`,
		query: `${binding.coreAlias}.Query<${binding.configType}>`,
		transaction: `${binding.coreAlias}.Transaction<${binding.configType}>`,
		generic: (genericName: string, element: string) =>
			`${binding.coreAlias}.${genericName}<${binding.configType}, ${element}>`,
		nullary: (typeName: string) => `${binding.coreAlias}.${typeName}<${binding.configType}>`,
	}
}
