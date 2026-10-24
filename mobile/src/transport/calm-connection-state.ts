import { useEffect, useRef, useState } from 'react'
import {
  CALM_STATUS_IDLE,
  stepCalmStatusReveal,
  type CalmStatusReveal
} from '../../../src/shared/calm-status-reveal'
import type { ConnectionState } from './types'

/**
 * What the header shows for a connection: a drop after this session was connected reads as
 * connected until it outlasts a clean reconnect, the same schedule the desktop banner uses.
 * The first connect and a refused pairing show at once.
 */
export function stepCalmConnectionState(
  previous: CalmStatusReveal,
  input: { state: ConnectionState; lastConnectedAt: number | null; now: number }
): { next: CalmStatusReveal; presented: ConnectionState; recheckInMs: number | null } {
  // Why 'disconnected' waits too: an app suspend publishes it and the resume redials at once.
  const healing = input.state !== 'auth-failed' && input.lastConnectedAt !== null
  const step = stepCalmStatusReveal(previous, {
    down: input.state !== 'connected',
    immediate: !healing,
    now: input.now
  })
  return {
    next: step.next,
    presented: step.visible || input.state === 'connected' ? input.state : 'connected',
    recheckInMs: step.recheckInMs
  }
}

export function useCalmConnectionState(
  state: ConnectionState,
  lastConnectedAt: number | null
): ConnectionState {
  const revealRef = useRef<CalmStatusReveal>(CALM_STATUS_IDLE)
  const [presented, setPresented] = useState<ConnectionState>(
    () =>
      stepCalmConnectionState(CALM_STATUS_IDLE, { state, lastConnectedAt, now: Date.now() })
        .presented
  )
  const [wake, setWake] = useState(0)
  useEffect(() => {
    const step = stepCalmConnectionState(revealRef.current, {
      state,
      lastConnectedAt,
      now: Date.now()
    })
    revealRef.current = step.next
    setPresented(step.presented)
    if (step.recheckInMs === null) {
      return
    }
    const timer = setTimeout(() => setWake((count) => count + 1), Math.max(0, step.recheckInMs))
    return () => clearTimeout(timer)
  }, [state, lastConnectedAt, wake])
  return presented
}
