import { NextResponse } from 'next/server'
import { getOutagePrediction } from '@/lib/gemini'

export async function POST(req: Request) {
  try {
    const { weatherDetails } = await req.json()
    
    if (!weatherDetails || !Array.isArray(weatherDetails)) {
      return NextResponse.json({ error: 'Invalid weather data' }, { status: 400 })
    }

    const prediction = await getOutagePrediction(weatherDetails)
    return NextResponse.json(prediction)
  } catch (err) {
    console.error('[/api/weather/predict]', err)
    return NextResponse.json({ 
      error: 'AI Prediction failed',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 })
  }
}
