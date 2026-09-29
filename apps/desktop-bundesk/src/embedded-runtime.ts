/** Read-only Bun executable assets with on-demand native-file materialization. */

import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, normalize } from 'node:path'

/** DSH data mounted inside the standalone executable. */
export interface EmbeddedDshRuntime {
  /** Root of the embedded `dsh` asset tree. */
  readonly root: string
  /** Repository version compiled into the executable. */
  readonly version: string
}

let nativeRoot: string | undefined

/**
 * Return whether a native asset has been copied out of Bun's read-only filesystem.
 * @returns whether this process has requested its native temporary directory.
 */
export function embeddedNativeRuntimeWasMaterialized(): boolean {
  return nativeRoot !== undefined
}

/**
 * Return a native runtime asset as an operating-system path.
 *
 * Ordinary files stay inside Bun's virtual filesystem. Native dynamic loaders
 * and process creation require a real path, so their target-specific files are
 * copied into one process-owned temporary directory only on first use.
 *
 * @param runtime - embedded desktop asset root.
 * @param relativePath - slash-independent path below the runtime root.
 * @param executable - whether the copied leaf must be executable.
 * @returns a promise for the source path outside standalone mode, or the temporary native path.
 */
export function materializeEmbeddedNativePath(
  runtime: EmbeddedDshRuntime,
  relativePath: string,
  executable = false,
): Promise<string> {
  return Promise.resolve().then(() => materializeEmbeddedNativePathSync(runtime, relativePath, executable))
}

/**
 * Return a native runtime asset as an operating-system path without deferring the copy.
 * A synchronous module loader — the compiled Host's Sharp factory — cannot await the
 * temporary-directory copy, so it materializes the asset in place.
 * @param runtime - embedded desktop asset root.
 * @param relativePath - slash-independent path below the runtime root.
 * @param executable - whether the copied leaf must be executable.
 * @returns the source path outside standalone mode, or the temporary native path.
 */
export function materializeEmbeddedNativePathSync(
  runtime: EmbeddedDshRuntime,
  relativePath: string,
  executable = false,
): string {
  const source = runtimePath(runtime, relativePath)
  if (!isBunVirtualPath(source)) return source
  const destination = join(resolveNativeRoot(), relativePath)
  copyRuntimeEntry(source, destination, executable)
  return destination
}

/** Remove native files materialized by this process, when their OS handles permit it. */
export async function disposeEmbeddedNativeRuntime(): Promise<void> {
  const root = nativeRoot
  nativeRoot = undefined
  if (root === undefined) return
  try {
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  } catch (error) {
    // Windows keeps loaded DLLs locked until process teardown; only that host
    // lock can survive cleanup of this process-owned temporary directory.
    const code = (error as NodeJS.ErrnoException).code
    if (process.platform === 'win32' && (code === 'EPERM' || code === 'EBUSY')) return
    throw error
  }
}

function runtimePath(runtime: EmbeddedDshRuntime, relativePath: string): string {
  const normalized = normalize(relativePath)
  const parentPrefix = `..${process.platform === 'win32' ? '\\' : '/'}`
  if (relativePath === '' || isAbsolute(relativePath) || normalized === '..' || normalized.startsWith(parentPrefix)) {
    throw new Error(`dsh-desktop: embedded runtime path is unsafe: ${JSON.stringify(relativePath)}`)
  }
  return join(runtime.root, normalized)
}

function isBunVirtualPath(path: string): boolean {
  return path.startsWith('/$bunfs/') || path.includes(':\\~BUN\\') || path.includes(':/~BUN/')
}

function resolveNativeRoot(): string {
  nativeRoot ??= mkdtempSync(join(tmpdir(), `dsh-desktop-native-${process.pid}-`))
  return nativeRoot
}

function copyRuntimeEntry(source: string, destination: string, executable: boolean): void {
  const sourceStat = lstatSync(source)
  if (sourceStat.isSymbolicLink()) throw new Error(`dsh-desktop: embedded native asset is a symbolic link: ${source}`)
  if (sourceStat.isDirectory()) {
    mkdirSync(destination, { recursive: true, mode: 0o700 })
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      copyRuntimeEntry(join(source, entry.name), join(destination, entry.name), false)
    }
    return
  }
  if (!sourceStat.isFile()) throw new Error(`dsh-desktop: embedded native asset is not a regular file: ${source}`)
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
  if (!existsSync(destination)) {
    writeFileSync(destination, readFileSync(source), { mode: executable ? 0o700 : 0o600 })
  }
  if (executable && process.platform !== 'win32') chmodSync(destination, 0o700)
}
