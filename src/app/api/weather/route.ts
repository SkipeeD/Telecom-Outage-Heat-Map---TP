import { NextResponse } from 'next/server'
import { CITY_CENTERS } from '@/lib/weather-cities'

type Condition = 'sunny' | 'rainy' | 'cloudy' | 'stormy' | 'windy'
type Risk = 'low' | 'medium' | 'high'

export interface CityWeatherDetail {
  city: string
  region: string
  temp: number
  condition: Condition
  risk: Risk
  description: string
  precipitation: number
  windSpeed: number
}

const CITY_REGIONS: Record<string, string> = {
  'București':              'Muntenia',
  'Cluj-Napoca':            'Transylvania',
  'Timișoara':              'Banat',
  'Iași':                   'Moldova',
  'Constanța':              'Dobrogea',
  'Craiova':                'Oltenia',
  'Brașov':                 'Transylvania',
  'Galați':                 'Moldova',
  'Ploiești':               'Muntenia',
  'Oradea':                 'Crișana',
  'Alba Iulia':             'Transylvania',
  'Arad':                   'Crișana',
  'Pitești':                'Muntenia',
  'Bacău':                  'Moldova',
  'Bistrița':               'Transylvania',
  'Botoșani':               'Moldova',
  'Brăila':                 'Muntenia',
  'Buzău':                  'Muntenia',
  'Călărași':               'Muntenia',
  'Sfântu Gheorghe':        'Transylvania',
  'Târgoviște':             'Muntenia',
  'Giurgiu':                'Muntenia',
  'Târgu Jiu':              'Oltenia',
  'Miercurea Ciuc':         'Transylvania',
  'Deva':                   'Transylvania',
  'Slobozia':               'Muntenia',
  'Baia Mare':              'Maramureș',
  'Drobeta-Turnu Severin':  'Oltenia',
  'Târgu Mureș':            'Transylvania',
  'Piatra Neamț':           'Moldova',
  'Slatina':                'Oltenia',
  'Zalău':                  'Crișana',
  'Satu Mare':              'Crișana',
  'Sibiu':                  'Transylvania',
  'Suceava':                'Bucovina',
  'Alexandria':             'Muntenia',
  'Tulcea':                 'Dobrogea',
  'Râmnicu Vâlcea':         'Oltenia',
  'Vaslui':                 'Moldova',
  'Focșani':                'Moldova',
  'Vatra Dornei':           'Bucovina',
  'Brad':                   'Transylvania',
  'Beiuș':                  'Crișana',
  'Reșița':                 'Banat',
  'Vișeu de Sus':           'Maramureș',
  'Gheorgheni':             'Transylvania',
  'Bârlad':                 'Moldova',
}

/**
 * Converts a WMO weather interpretation code and wind speed into a simplified
 * Condition category. Wind is checked after precipitation codes so that a
 * stormy/rainy day with high wind is still labelled by precipitation first.
 * See https://open-meteo.com/en/docs for the full WMO code table.
 */
function weatherCodeToCondition(code: number, windSpeed: number): Condition {
  if (code >= 95) return 'stormy'
  if (code >= 80) return 'rainy'
  if (code >= 71) return 'cloudy'  // snow
  if (code >= 51) return 'rainy'   // drizzle + rain
  if (code >= 45) return 'cloudy'  // fog
  if (windSpeed > 40) return 'windy'
  if (code >= 1)  return 'cloudy'  // partly/mostly cloudy
  return 'sunny'
}

/**
 * Maps weather metrics to a network-impact risk level.
 * Thresholds: stormy/wind>60 km/h/precip>5 mm → high; rainy/wind>30/any precip → medium.
 */
function deriveRisk(precipitation: number, windSpeed: number, condition: Condition): Risk {
  if (condition === 'stormy' || windSpeed > 60 || precipitation > 5) return 'high'
  if (condition === 'rainy' || condition === 'windy' || windSpeed > 30 || precipitation > 0) return 'medium'
  return 'low'
}

/** Returns a human-readable NOC status string for a given condition/risk combination. */
function deriveDescription(condition: Condition, risk: Risk): string {
  if (condition === 'stormy') return 'Severe electrical activity. High risk of power fluctuations.'
  if (condition === 'rainy' && risk === 'high') return 'Heavy precipitation. Structural monitoring active.'
  if (condition === 'rainy') return 'Precipitation detected. Potential for signal attenuation.'
  if (condition === 'windy') return 'High winds. Monitoring microwave link stability.'
  if (condition === 'cloudy') return 'Overcast conditions. No immediate network impact.'
  return 'Clear skies. Optimal network performance.'
}

interface OpenMeteoLocation {
  current: {
    precipitation: number
    wind_speed_10m: number
    temperature_2m: number
    weather_code: number
  }
}

/**
 * GET /api/weather
 *
 * Fetches current weather for all Romanian city centres defined in CITY_CENTERS
 * from the Open-Meteo API (no API key required) and returns:
 *   - weatherRisk:    a city-name → boolean map (true = precipitation > 0 OR wind > 50 km/h)
 *   - weatherDetails: enriched per-city objects with condition, risk, and description
 *
 * The response is cached by Next.js for 30 minutes (revalidate: 1800) to avoid
 * hammering the external API on every client poll. On error, empty collections
 * are returned rather than propagating a 500 so the UI degrades gracefully.
 *
 * This endpoint requires no auth — weather data is not sensitive.
 *
 * Returns: { weatherRisk: Record<string, boolean>; weatherDetails: CityWeatherDetail[] }
 */
export async function GET() {
  try {
    const lats = CITY_CENTERS.map(c => c.lat).join(',')
    const lons = CITY_CENTERS.map(c => c.lon).join(',')

    // Batch all cities into a single Open-Meteo request using comma-separated coordinates.
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lats}&longitude=${lons}` +
      `&current=precipitation,wind_speed_10m,temperature_2m,weather_code` +
      `&wind_speed_unit=kmh` +
      `&timezone=Europe%2FBucharest`

    const res = await fetch(url, { next: { revalidate: 1800 } })

    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)

    const data: OpenMeteoLocation[] = await res.json()

    const weatherRisk: Record<string, boolean> = {}
    const weatherDetails: CityWeatherDetail[] = []

    data.forEach((loc, i) => {
      const city = CITY_CENTERS[i]
      const { precipitation, wind_speed_10m, temperature_2m, weather_code } = loc.current
      const prec      = precipitation    ?? 0
      const wind      = wind_speed_10m   ?? 0
      const temp      = Math.round(temperature_2m ?? 0)
      const condition = weatherCodeToCondition(weather_code ?? 0, wind)
      const risk      = deriveRisk(prec, wind, condition)

      // Flag the city as weather-risky when there is any precipitation or strong wind.
      weatherRisk[city.name] = prec > 0 || wind > 50
      weatherDetails.push({
        city:          city.name,
        region:        CITY_REGIONS[city.name] ?? 'Romania',
        temp,
        condition,
        risk,
        description:   deriveDescription(condition, risk),
        precipitation: prec,
        windSpeed:     Math.round(wind),
      })
    })

    return NextResponse.json({ weatherRisk, weatherDetails })
  } catch (err) {
    console.error('[/api/weather]', err)
    return NextResponse.json({ weatherRisk: {}, weatherDetails: [] })
  }
}
