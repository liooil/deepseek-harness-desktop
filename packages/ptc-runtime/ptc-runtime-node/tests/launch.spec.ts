import { expect, it, onTestFinished } from 'vitest'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import { bootstrapArgs, isBunHost, isPackagedHost } from '../src/launch.ts'

/** Install a fake compiled-Bun host for one test, then restore the real globals. */
function stubBunHost(host: { isStandaloneExecutable?: boolean; embeddedFiles?: readonly unknown[] }): void {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'Bun')
  Object.defineProperty(globalThis, 'Bun', { configurable: true, value: host })
  onTestFinished(() => {
    if (prior === undefined) Reflect.deleteProperty(globalThis, 'Bun')
    else Object.defineProperty(globalThis, 'Bun', prior)
  })
}

it('uses an explicit installed bootstrap without pretending it maps the host file', () => {
  const fs = { processPathFromHostPath: () => { throw new Error('must not map') } } as unknown as FileSystem
  expect(bootstrapArgs(fs, { bootstrapPath: '/remote/process.js' }, 2048)).toEqual(['/remote/process.js', '2048'])
})

it('fails when the execution world cannot read the source bootstrap', () => {
  const fs = { processPathFromHostPath: () => undefined } as unknown as FileSystem
  expect(() => bootstrapArgs(fs, {}, 2048)).toThrow('unavailable in the subprocess execution world')
})

it('selects the private packaged bootstrap through the existing executable', () => {
  const prior = Object.getOwnPropertyDescriptor(process, 'pkg')
  try {
    Object.defineProperty(process, 'pkg', { configurable: true, value: {} })
    const fs = { processPathFromHostPath: () => { throw new Error('pkg does not expose a host bootstrap file') } } as unknown as FileSystem
    expect(bootstrapArgs(fs, {}, 2048)).toEqual(['2048'])
  } finally {
    if (prior === undefined) Reflect.deleteProperty(process, 'pkg')
    else Object.defineProperty(process, 'pkg', prior)
  }
})

it('selects the private packaged bootstrap for a compiled Bun standalone', () => {
  stubBunHost({ isStandaloneExecutable: true })
  const fs = { processPathFromHostPath: () => { throw new Error('a compiled executable exposes no host bootstrap file') } } as unknown as FileSystem
  expect(bootstrapArgs(fs, {}, 2048)).toEqual(['2048'])
})

it('reads the compiled Bun host from its embedded files when the standalone flag is absent', () => {
  stubBunHost({ embeddedFiles: [new Blob(['fixture'])] })
  expect(isPackagedHost()).toBe(true)
})

it('keeps caller-relative bootstrap selection for an interpreted Bun host', () => {
  stubBunHost({})
  expect(isPackagedHost()).toBe(false)
  const fs = { processPathFromHostPath: () => undefined } as unknown as FileSystem
  expect(() => bootstrapArgs(fs, {}, 2048)).toThrow('unavailable in the subprocess execution world')
})

it('reports a Bun host and a Node host', () => {
  expect(isBunHost()).toBe(false)
  stubBunHost({})
  expect(isBunHost()).toBe(true)
})
