/** Select source or built bootstrap assets in the mounted execution world. */
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { FileSystem } from '@deepseek-ai/dsh-fs'

/** Deployment-owned Node executable and optional preinstalled built bootstrap. */
export interface LaunchConfig {
  /** Executable in the subprocess world; defaults to the current Node executable. */
  nodeExecutable?: string
  /** Absolute preinstalled built bootstrap in the execution world. */
  bootstrapPath?: string
}

/** A single-file executable host that re-runs itself as the program child. */
interface StandaloneHost {
  /** Bun's own compiled-executable flag, absent before it was added. */
  isStandaloneExecutable?: boolean
  /** Files Bun embedded into a compiled executable; empty in an interpreted host. */
  embeddedFiles?: readonly unknown[]
}

/**
 * Whether the current host is a single-file executable that re-runs itself as the PTC
 * child: a `pkg`-packaged Node binary or a compiled Bun standalone. Such a host passes
 * only the frame limit, and its own entry decides to run the program child from the
 * environment {@link import('./index.ts')} adds.
 * @returns true when the executable itself carries the program bootstrap.
 */
export function isPackagedHost(): boolean {
  const bun = (globalThis as { Bun?: StandaloneHost }).Bun
  return 'pkg' in process || bun?.isStandaloneExecutable === true || (bun?.embeddedFiles?.length ?? 0) > 0
}

/**
 * Whether the current host is Bun rather than Node.
 * @returns true when the runtime executes under Bun.
 */
export function isBunHost(): boolean {
  return (globalThis as { Bun?: unknown }).Bun !== undefined
}

/**
 * Select explicit arguments without inheriting host loader or inspector flags.
 * @param fs - Filesystem mapping host bootstrap assets into the process world.
 * @param config - Optional preinstalled built bootstrap.
 * @param maxMessageBytes - Validated frame and queued-write limit.
 * @returns Arguments following the resolved Node executable.
 */
export function bootstrapArgs(fs: FileSystem, config: LaunchConfig, maxMessageBytes: number): string[] {
  if (config.bootstrapPath !== undefined) return [config.bootstrapPath, String(maxMessageBytes)]
  if (isPackagedHost()) return [String(maxMessageBytes)]
  const mapped = (path: string): string => {
    const result = fs.processPathFromHostPath(path)
    if (result === undefined) throw new Error(`PTC runtime bootstrap is unavailable in the subprocess execution world: ${path}`)
    return result
  }
  /* v8 ignore next 3 -- built-lib.e2e.ts executes the bundled provider and sibling process.js under plain Node. */
  if (!new URL(import.meta.url).pathname.endsWith('.ts')) {
    return [mapped(fileURLToPath(new URL('./process.js', import.meta.url))), String(maxMessageBytes)]
  }
  const entry = mapped(fileURLToPath(new URL('./process.ts', import.meta.url)))
  const subprocess = dirname(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-subprocess/package.json')))
  const helper = mapped(resolve(subprocess, 'src/control.ts'))
  const source = `const {openInheritedControlChannel}=await import(${JSON.stringify(pathToFileURL(helper).href)});const {runNodeMain}=await import(${JSON.stringify(pathToFileURL(entry).href)});await runNodeMain(openInheritedControlChannel(),${maxMessageBytes},process);`
  return ['--input-type=module', '--eval', source]
}
