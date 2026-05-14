import { GoogleGenerativeAI } from '@google/generative-ai'
import type { CityWeatherDetail } from '@/app/api/weather/route'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' })

const SYSTEM_PROMPT = `
You are an AI NOC Specialist analyzing weather impact on telecom infrastructure in Romania.
You will receive real weather data for multiple cities. Assess each city and predict network risk.

RISK LEVELS:
- High: Severe conditions likely to cause outages or significant degradation
- Medium: Conditions that may cause intermittent issues or require monitoring
- Low: Mild conditions with minimal impact — do not include in riskZones
- None: Clear conditions — do not include in riskZones

RULES:
- Only include cities with severity "High" or "Medium" in riskZones
- If all cities are stable, return an empty riskZones array
- Maximum 4 cities in riskZones — prioritize highest severity
- The outlook must always be informative even when riskZones is empty
- Respond ONLY with valid JSON. No markdown, no backticks, no preamble.

{
  "outlook": "One sentence summary of overall network status across Romania.",
  "riskZones": [
    {
      "city": "City Name",
      "severity": "High | Medium",
      "reason": "Your technical assessment of what infrastructure is at risk and why",
      "conditions": "Brief weather summary (e.g. wind 72km/h, heavy rain)"
    }
  ],
  "recommendation": "One concrete action for field engineers based on current conditions."
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
