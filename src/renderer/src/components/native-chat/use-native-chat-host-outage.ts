import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import { runtimeHostContactFromSnapshot } from '../../../../shared/runtime-host-contact'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { runtimeHostConnectionStateForEntry } from '@/runtime/runtime-host-connection-state'
import {
  runtimeHostOutageKind,
  type RuntimeHostOutageKind
} from '@/runtime/runtime-host-outage-kind'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

export type NativeChatHostOutageKind = RuntimeHostOutageKind

export type NativeChatHostOutage = {
  kind: NativeChatHostOutageKind
  environmentId: string
  hostLabel: string
  /** False when the host refused us (auth, protocol): a reconnect is turned away the same way. */
  canReconnect: boolean
}

/** A blip shorter than this says nothing; an offline host is said at once. */
export const NATIVE_CHAT_HOST_RECONNECTING_GRACE_MS = 2_000

/** The chat's host outage, read from the host's connection state and never the chat's own stream. */
export function useNativeChatHostOutage(target: RuntimeClientTarget): NativeChatHostOutage | null {
  const environmentId = target.kind === 'environment' ? target.environmentId : null
  const kind = useAppStore((s) =>
    environmentId === null
      ? null
      : runtimeHostOutageKind(
          runtimeHostConnectionStateForEntry(s.runtimeStatusByEnvironmentId.get(environmentId))
        )
  )
  const refused = useAppStore((s) => {
    const entry = environmentId === null ? null : s.runtimeStatusByEnvironmentId.get(environmentId)
    return entry?.snapshot
      ? runtimeHostContactFromSnapshot(entry.snapshot, entry.status).verdict === 'refused'
      : false
  })
  const hostLabel = useAppStore((s) =>
    environmentId === null
      ? null
      : selectExecutionHostDisplayLabel(s, toRuntimeExecutionHostId(environmentId))
  )
  // What this outage has earned so far; it ends with the outage or a change of host.
  const [earned, setEarned] = useState<{
    environmentId: string
    kind: NativeChatHostOutageKind
  } | null>(null)
  const earnedHere = earned?.environmentId === environmentId ? earned.kind : null
  // Held to the outage's end, so a retry's probe doesn't flip it to reconnecting and back.
  if (kind === 'offline' && environmentId !== null && earnedHere !== 'offline') {
    setEarned({ environmentId, kind: 'offline' })
  }
  const inOutage = kind !== null
  useEffect(() => {
    if (environmentId === null || !inOutage) {
      return
    }
    const timer = setTimeout(() => {
      setEarned((current) =>
        current?.environmentId === environmentId ? current : { environmentId, kind: 'reconnecting' }
      )
    }, NATIVE_CHAT_HOST_RECONNECTING_GRACE_MS)
    return () => {
      clearTimeout(timer)
      setEarned((current) => (current?.environmentId === environmentId ? null : current))
    }
  }, [environmentId, inOutage])
  const shown = kind === 'offline' ? 'offline' : kind === null ? null : earnedHere
  return useMemo(
    () =>
      environmentId === null || shown === null || hostLabel === null
        ? null
        : { kind: shown, environmentId, hostLabel, canReconnect: shown === 'offline' && !refused },
    [environmentId, hostLabel, refused, shown]
  )
}
