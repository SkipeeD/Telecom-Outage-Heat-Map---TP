import { GoogleGenerativeAI } from '@google/generative-ai'
import type { CityWeatherDetail } from '@/app/api/weather/route'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' })

const SYSTEM_PROMPT = `
You are a Senior NOC (Network Operations Center) AI Specialist for a major telecom provider in Romania.
Your task is to analyze weather data across multiple cities and predict potential network outages.

CONSTRAINTS:
1. Identify specific regions or cities at "High Risk" due to severe weather (Wind > 60km/h, Storms, Heavy Rain).
2. Explain the TECHNICAL reason for the risk (e.g., "Microwave misalignment", "Power grid instability", "Signal attenuation").
3. Provide a brief "Network Outlook" (Overall status).
4. Keep your response concise, professional, and formatted as a JSON object.

JSON FORMAT:
{
  "outlook": "Professional summary of the network status in 1 sentence.",
  "highRiskZones": [
    { "city": "City Name", "reason": "Specific technical risk description", "severity": "High" }
  ],
  "recommendation": "One actionable advice for field engineers."
}
`

export async function getOutagePrediction(weatherData: CityWeatherDetail[]) {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    throw new Error('GOOGLE_GEMINI_API_KEY is not configured')
  }

  // Filter for cities with non-low risk to keep prompt size small and focus on issues
  const relevantData = weatherData
    .filter(w => w.risk !== 'low')
    .map(w => ({
      city: w.city,
      temp: w.temp,
      condition: w.condition,
      wind: w.windSpeed,
      precip: w.precipitation
    }))

  const prompt = `
Current Weather Data for investigation:
${JSON.stringify(relevantData)}

Analyze this data and return the outage prediction in the specified JSON format.
If no cities are at risk, return an empty highRiskZones array but still provide an outlook.
`

  const result = await model.generateContent([SYSTEM_PROMPT, prompt])
  const response = await result.response
  const text = response.text()

  // Clean up potential markdown formatting in AI response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
  }
  
  throw new Error('AI response was not in valid JSON format')
}
