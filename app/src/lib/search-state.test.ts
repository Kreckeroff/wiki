import { describe, expect, it } from 'vitest'
import { createSearchRequestGate, moveActiveId } from './search-state'

describe('состояние списка поиска', () => {
  it('двигает активный пункт по недавним и результатам с остановкой на краях', () => {
    expect(moveActiveId(['one', 'two', 'three'], null, 1)).toBe('one')
    expect(moveActiveId(['one', 'two', 'three'], 'one', 1)).toBe('two')
    expect(moveActiveId(['one', 'two', 'three'], 'three', 1)).toBe('three')
    expect(moveActiveId(['one', 'two', 'three'], 'two', -1)).toBe('one')
    expect(moveActiveId(['one', 'two', 'three'], 'one', -1)).toBe('one')
    expect(moveActiveId([], null, 1)).toBeNull()
  })
})

describe('актуальность поискового запроса', () => {
  it('отменяет прежний fetch и отклоняет его поздний ответ при новом запросе', () => {
    const gate = createSearchRequestGate()
    const previous = gate.begin()
    const current = gate.begin()

    expect(previous.signal.aborted).toBe(true)
    expect(current.signal.aborted).toBe(false)
    expect(gate.isCurrent(previous.version)).toBe(false)
    expect(gate.isCurrent(current.version)).toBe(true)
  })

  it('отменяет запрос и делает ответ устаревшим при очистке query или смене workspace', () => {
    const gate = createSearchRequestGate()
    const request = gate.begin()

    gate.invalidate()

    expect(request.signal.aborted).toBe(true)
    expect(gate.isCurrent(request.version)).toBe(false)
  })
})
