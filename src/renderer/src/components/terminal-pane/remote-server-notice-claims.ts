import { useEffect, useId, useSyncExternalStore } from 'react'
import { CALM_STATUS_HEALTHY_HOLD_MS } from '../../../../shared/calm-status-reveal'

/**
 * Which visible terminal surface speaks for a server whose connection dropped. The first visible
 * claimant shows the one notice; every other surface on that server stays quiet. Every mounted
 * surface on that server observes the outage, hidden or not, so its start survives a tab switch
 * and the notice neither re-waits nor resets its clock.
 */
type ServerOutage = {
  observers: Set<string>
  speakers: string[]
  since: number
  releaseTimer: number | null
}

const outages = new Map<string, ServerOutage>()
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

function observe(environmentId: string, observer: string): () => void {
  let outage = outages.get(environmentId)
  if (!outage) {
    outage = { observers: new Set(), speakers: [], since: Date.now(), releaseTimer: null }
    outages.set(environmentId, outage)
  }
  if (outage.releaseTimer !== null) {
    window.clearTimeout(outage.releaseTimer)
    outage.releaseTimer = null
  }
  outage.observers.add(observer)
  notify()
  return () => {
    const current = outages.get(environmentId)
    if (!current) {
      return
    }
    current.observers.delete(observer)
    if (current.observers.size > 0 || current.releaseTimer !== null) {
      return
    }
    // Why held briefly: a tab switch unmounts one observer before the next mounts.
    current.releaseTimer = window.setTimeout(() => {
      if (outages.get(environmentId)?.observers.size === 0) {
        outages.delete(environmentId)
        notify()
      }
    }, CALM_STATUS_HEALTHY_HOLD_MS)
  }
}

function speak(environmentId: string, speaker: string): () => void {
  const outage = outages.get(environmentId)
  if (outage) {
    outage.speakers = [...outage.speakers, speaker]
    notify()
  }
  return () => {
    const current = outages.get(environmentId)
    if (current) {
      current.speakers = current.speakers.filter((entry) => entry !== speaker)
      notify()
    }
  }
}

export type RemoteServerNoticeClaim = {
  /** This surface shows the server's notice. */
  speaks: boolean
  /** Some visible surface shows it, so panes on this server may stay quiet. */
  spoken: boolean
  /** When any mounted surface first saw the outage. */
  since: number | null
}

const NO_CLAIM: RemoteServerNoticeClaim = { speaks: false, spoken: false, since: null }

export function useRemoteServerNoticeClaim(
  environmentId: string | null,
  canSpeak: boolean
): RemoteServerNoticeClaim {
  const surface = useId()
  useEffect(
    () => (environmentId === null ? undefined : observe(environmentId, surface)),
    [environmentId, surface]
  )
  // Why after observe: effects run in order, so the outage record exists to speak into.
  useEffect(
    () => (environmentId === null || !canSpeak ? undefined : speak(environmentId, surface)),
    [canSpeak, environmentId, surface]
  )
  const leader = useSyncExternalStore(subscribe, () =>
    environmentId === null ? null : (outages.get(environmentId)?.speakers[0] ?? null)
  )
  const since = useSyncExternalStore(subscribe, () =>
    environmentId === null ? null : (outages.get(environmentId)?.since ?? null)
  )
  if (environmentId === null) {
    return NO_CLAIM
  }
  return { speaks: leader === surface, spoken: leader !== null, since }
}
