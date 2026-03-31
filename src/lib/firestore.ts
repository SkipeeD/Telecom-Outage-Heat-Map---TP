import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Antenna, Alarm } from '@/types'

export async function getAntennas(): Promise<Antenna[]> {
  const snapshot = await getDocs(collection(db, 'antennas'))
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Antenna))
}

export async function getAlarmsForAntenna(antennaId: string): Promise<Alarm[]> {
  const q = query(
    collection(db, 'alarms'),
    where('antennaId', '==', antennaId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Alarm))
}

export function subscribeToAntennas(
  callback: (antennas: Antenna[]) => void
): () => void {
  return onSnapshot(collection(db, 'antennas'), (snapshot) => {
    const antennas = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Antenna)
    )
    callback(antennas)
  })
}
