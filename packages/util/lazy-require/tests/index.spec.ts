import { afterEach, expect, it } from 'vitest'
import { configureLazyRequire, createLazyRequire } from '../src/index.ts'

interface FixtureGlobal {
  __dshLazyRequireLoads?: number
}

const fixtureGlobal = globalThis as FixtureGlobal

afterEach(() => {
  delete fixtureGlobal.__dshLazyRequireLoads
})

it('resolves from the caller and caches the successful module value', () => {
  const load = createLazyRequire<{ value: number }>('./fixtures/value.cjs', import.meta.url)
  expect(fixtureGlobal.__dshLazyRequireLoads).toBeUndefined()
  const first = load()
  expect(first).toEqual({ value: 42 })
  expect(load()).toBe(first)
  expect(fixtureGlobal.__dshLazyRequireLoads).toBe(1)
})

it('does not cache a failed load', () => {
  const load = createLazyRequire<unknown>('./fixtures/missing.cjs', import.meta.url)
  expect(load).toThrow(/missing\.cjs/u)
  expect(load).toThrow(/missing\.cjs/u)
})

it('loads a registered specifier through the host loader and caches its value', () => {
  let loads = 0
  configureLazyRequire('dsh-lazy-require-host-fixture', () => {
    loads += 1
    return { host: true }
  })
  const load = createLazyRequire<{ host: boolean }>('dsh-lazy-require-host-fixture', import.meta.url)
  const first = load()
  expect(first).toEqual({ host: true })
  expect(load()).toBe(first)
  expect(loads).toBe(1)
})

it('replaces an earlier host loader for the same specifier', () => {
  configureLazyRequire('dsh-lazy-require-replaced-fixture', () => ({ generation: 1 }))
  configureLazyRequire('dsh-lazy-require-replaced-fixture', () => ({ generation: 2 }))
  const load = createLazyRequire<{ generation: number }>('dsh-lazy-require-replaced-fixture', import.meta.url)
  expect(load()).toEqual({ generation: 2 })
})

it('does not cache a failed host load', () => {
  configureLazyRequire('dsh-lazy-require-failing-fixture', () => { throw new Error('host loader failed') })
  const load = createLazyRequire<unknown>('dsh-lazy-require-failing-fixture', import.meta.url)
  expect(load).toThrow('host loader failed')
  expect(load).toThrow('host loader failed')
})
