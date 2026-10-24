// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CalmRemoteRuntimeReconnectBanner,
  TerminalRemoteRuntimeReconnectBanner
} from './TerminalRemoteRuntimeReconnectBanner'
import { CALM_STATUS_REVEAL_DELAY_MS } from '../../../../shared/calm-status-reveal'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, string>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => options?.[name] ?? ''),
  getIntlLocale: () => 'en-US'
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      settings: {},
      runtimeEnvironments: [
        {
          id: 'env-1',
          name: 'Desk',
          preferredEndpointId: 'ws',
          endpoints: [{ id: 'ws', endpoint: 'ws://100.101.102.103:6768' }]
        }
      ]
    })
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TerminalRemoteRuntimeReconnectBanner', () => {
  it('names the server and the cause while retrying, without a manual action', () => {
    render(
      <TerminalRemoteRuntimeReconnectBanner
        recovery={{ phase: 'backoff', cause: 'stream-stalled' }}
        serverName="Desk"
        onReconnect={vi.fn()}
      />
    )

    expect(screen.getByText('Terminal stopped responding')).toBeInTheDocument()
    expect(screen.getByText(/Desk stopped sending/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('never claims a parked pane is retrying, and offers to try now', async () => {
    const onReconnect = vi.fn()
    const user = userEvent.setup()
    render(
      <TerminalRemoteRuntimeReconnectBanner
        recovery={{ phase: 'recovering', cause: 'stream-ended', waiting: true }}
        serverName="Desk"
        onReconnect={onReconnect}
      />
    )

    expect(screen.getByText('Waiting for Desk')).toBeInTheDocument()
    expect(screen.queryByText(/retrying/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(onReconnect).toHaveBeenCalledOnce()
  })

  it('offers one explicit reconnect action after automatic recovery stops', async () => {
    const onReconnect = vi.fn()
    const user = userEvent.setup()
    render(
      <TerminalRemoteRuntimeReconnectBanner
        recovery={{ phase: 'disconnected' }}
        serverName="Desk"
        onReconnect={onReconnect}
      />
    )

    expect(screen.getByText('Remote runtime disconnected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(onReconnect).toHaveBeenCalledOnce()
  })

  it('says the host refused this computer instead of spinning, even mid-recovery', () => {
    render(
      <TerminalRemoteRuntimeReconnectBanner
        recovery={{ phase: 'backoff' }}
        serverName="Desk"
        onReconnect={vi.fn()}
        pairingRefused
      />
    )

    expect(screen.getByText('This host no longer accepts this computer')).toBeInTheDocument()
    expect(screen.queryByText('Reconnecting to Desk')).not.toBeInTheDocument()
  })
})

describe('CalmRemoteRuntimeReconnectBanner', () => {
  it('stays quiet through a reconnect a 400 ms relay finishes, then says it with a Tailscale hint', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <CalmRemoteRuntimeReconnectBanner
        recovery={{ phase: 'backoff', cause: 'connection' }}
        environmentId="env-1"
        heldByServer={false}
        onReconnect={vi.fn()}
      />
    )
    act(() => vi.advanceTimersByTime(CALM_STATUS_REVEAL_DELAY_MS - 1))
    rerender(
      <CalmRemoteRuntimeReconnectBanner
        recovery={{ phase: 'recovering', cause: 'connection' }}
        environmentId="env-1"
        heldByServer={false}
        onReconnect={vi.fn()}
      />
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText('Reconnecting to Desk')).toBeInTheDocument()
    expect(screen.getByText('tailscale ping 100.101.102.103')).toBeInTheDocument()
  })

  it('shows a stopped recovery at once', () => {
    vi.useFakeTimers()
    render(
      <CalmRemoteRuntimeReconnectBanner
        recovery={{ phase: 'disconnected' }}
        environmentId="env-1"
        heldByServer={false}
        onReconnect={vi.fn()}
      />
    )
    expect(screen.getByText('Remote runtime disconnected')).toBeInTheDocument()
  })

  it('leaves a server-wide drop to the server notice', () => {
    vi.useFakeTimers()
    render(
      <CalmRemoteRuntimeReconnectBanner
        recovery={{ phase: 'disconnected' }}
        environmentId="env-1"
        heldByServer
        onReconnect={vi.fn()}
      />
    )
    act(() => vi.advanceTimersByTime(CALM_STATUS_REVEAL_DELAY_MS * 2))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
