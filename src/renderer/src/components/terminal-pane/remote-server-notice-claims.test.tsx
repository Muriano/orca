// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useRemoteServerNoticeClaim,
  type RemoteServerNoticeClaim
} from './remote-server-notice-claims'

const seen = new Map<string, RemoteServerNoticeClaim>()

function Surface({ name, environmentId }: { name: string; environmentId: string | null }) {
  seen.set(name, useRemoteServerNoticeClaim(environmentId))
  return null
}

afterEach(() => {
  cleanup()
  seen.clear()
  vi.useRealTimers()
})

describe('useRemoteServerNoticeClaim', () => {
  it('lets one visible surface speak for a dropped server while the rest stay quiet', () => {
    render(
      <>
        <Surface name="left" environmentId="env-1" />
        <Surface name="right" environmentId="env-1" />
        <Surface name="local" environmentId={null} />
      </>
    )

    expect(seen.get('left')).toMatchObject({ speaks: true, spoken: true })
    expect(seen.get('right')).toMatchObject({ speaks: false, spoken: true })
    expect(seen.get('local')).toMatchObject({ speaks: false, spoken: false })
  })

  it('hands the notice to the next surface without restarting the outage clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const view = render(<Surface name="first" environmentId="env-1" />)
    const since = seen.get('first')?.since
    vi.setSystemTime(9_000)
    act(() => view.unmount())
    render(<Surface name="second" environmentId="env-1" />)

    expect(seen.get('second')).toMatchObject({ speaks: true, since })
  })
})
