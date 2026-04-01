'use client'
import dynamic from 'next/dynamic'

const MapClient = dynamic(() => import('@/components/MapClient'), { ssr: false })

export default function Home() {
    return (
        <div style={{ width: '100%', height: '100vh' }}>
            <MapClient antennas={[]} onAntennaClick={(antenna) => console.log(antenna)} />
        </div>
    )
}
