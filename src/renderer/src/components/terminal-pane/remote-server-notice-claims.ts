import { useEffect, useId, useSyncExternalStore } from 'react'
import { CALM_STATUS_HEALTHY_HOLD_MS } from '../../../../shared/calm-status-reveal'

/**
 * Which visible terminal surface speaks for a server whose connection dropped. The first claimant
 * shows the one notice; every other surface on that server stays quiet. The outage start outlives
 * a hand-off between surfaces (a tab switch), so the notice neither re-waits nor resets its clock.
 */
type ServerClaims = { claimants: string[]; since: number; releaseTimer: number | null }

const claimsByEnvironment = new Map<string, ServerClaims>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function claim(environmentId: string, claimant: string): void {
  const existing = claimsByEnvironment.get(environmentId)
  if (existing) {
    if (existing.releaseTimer !== null) {
      window.clearTimeout(existing.releaseTimer)
      existing.releaseTimer = null
    }
    existing.claimants = [...existing.claimants, claimant]
  } else {
    claimsByEnvironment.set(environmentId, {
      claimants: [claimant],
      since: Date.now(),
      releaseTimer: null
    })
  }
  notify()
}

function release(environmentId: string, claimant: string): void {
  const existing = claimsByEnvironment.get(environmentId)
  if (!existing) {
    return
  }
  existing.claimants = existing.claimants.filter((entry) => entry !== claimant)
  if (existing.claimants.length === 0 && existing.releaseTimer === null) {
    existing.releaseTimer = window.setTimeout(() => {
      if (claimsByEnvironment.get(environmentId)?.claimants.length === 0) {
        claimsByEnvironment.delete(environmentId)
      }
    }, CALM_STATUS_HEALTHY_HOLD_MS)
  }
  notify()
}

export type RemoteServerNoticeClaim = {
  /** This surface shows the server's notice. */
  speaks: boolean
  /** Some visible surface shows it, so panes on this server may stay quiet. */
  spoken: boolean
  /** When the outage was first seen by any surface. */
  since: number | null
}

const NO_CLAIM: RemoteServerNoticeClaim = { speaks: false, spoken: false, since: null }

export function useRemoteServerNoticeClaim(environmentId: string | null): RemoteServerNoticeClaim {
  const claimant = useId()
  useEffect(() => {
    if (environmentId === null) {
      return
    }
    claim(environmentId, claimant)
    return () => release(environmentId, claimant)
  }, [claimant, environmentId])
  const leader = useSyncExternalStore(subscribe, () =>
    environmentId === null ? null : (claimsByEnvironment.get(environmentId)?.claimants[0] ?? null)
  )
  const since = useSyncExternalStore(subscribe, () =>
    environmentId === null ? null : (claimsByEnvironment.get(environmentId)?.since ?? null)
  )
  if (environmentId === null || leader === null) {
    return NO_CLAIM
  }
  return { speaks: leader === claimant, spoken: true, since }
}
