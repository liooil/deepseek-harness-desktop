/** Caller-relative lazy loading for CommonJS-compatible Host dependencies. */

import { createRequire } from 'node:module'

/** Host-supplied loaders that replace caller-relative `require` for one specifier. */
const hostLoaders = new Map<string, () => unknown>()

/**
 * Replace caller-relative resolution for one specifier with a host-owned loader.
 * A packaged Host — a single-file executable, for instance — supplies dependencies its
 * bundled module system cannot resolve, such as a native addon staged beside the
 * executable. Specifiers without a registered loader keep Node's caller-relative `require`.
 * @param specifier - Literal dependency specifier to load through `loader`.
 * @param loader - Zero-argument loader returning the module value.
 */
export function configureLazyRequire<T>(specifier: string, loader: () => T): void {
  hostLoaders.set(specifier, loader as () => unknown)
}

/**
 * Create a successful-result cache around Node's caller-relative `require`.
 * A failed load is not cached, so a corrected installation can be retried.
 * @param specifier - Literal dependency specifier declared by the caller package.
 * @param parentURL - Caller's `import.meta.url`, which owns package resolution.
 * @returns a zero-argument loader that resolves the dependency on first use.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- preserves caller-supplied module types
export function createLazyRequire<T>(specifier: string, parentURL: string | URL): () => T {
  const require = createRequire(parentURL)
  let loaded = false
  let value: T
  return () => {
    if (!loaded) {
      const hostLoader = hostLoaders.get(specifier)
      value = hostLoader === undefined ? require(specifier) as T : hostLoader() as T
      loaded = true
    }
    return value
  }
}
