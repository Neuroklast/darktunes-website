import { getNominatimUserAgent } from '@/lib/brand/userAgent'
import { APIProvider, Coordinates, GeocodingResult } from './types'

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'

export async function geocodeAddress(
  address: string,
  city: string,
  country: string,
  provider: APIProvider,
  apiKey?: string
): Promise<GeocodingResult> {
  const fullAddress = `${address}, ${city}, ${country}`
  
  try {
    if (provider === 'nominatim') {
      return await geocodeWithNominatim(fullAddress)
    } else if (provider === 'google' && apiKey) {
      return await geocodeWithGoogle(fullAddress, apiKey)
    } else {
      return { error: 'Invalid API configuration' }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Geocoding failed' }
  }
}

async function geocodeWithNominatim(address: string): Promise<GeocodingResult> {
  const url = `${NOMINATIM_BASE_URL}/search?` + new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
    addressdetails: '1'
  })

  const response = await fetch(url, {
    headers: {
      'User-Agent': getNominatimUserAgent(),
    }
  })

  if (!response.ok) {
    throw new Error('Nominatim API error')
  }

  const data = await response.json()

  if (!data || data.length === 0) {
    return { error: 'Address not found' }
  }

  const result = data[0]
  return {
    coords: {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon)
    },
    displayName: result.display_name
  }
}

async function geocodeWithGoogle(address: string, apiKey: string): Promise<GeocodingResult> {
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?' + new URLSearchParams({
    address,
    key: apiKey
  })

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Google Geocoding API error')
  }

  const data = await response.json()

  if (data.status !== 'OK' || !data.results || data.results.length === 0) {
    return { error: data.error_message || 'Address not found' }
  }

  const result = data.results[0]
  return {
    coords: {
      lat: result.geometry.location.lat,
      lon: result.geometry.location.lng
    },
    displayName: result.formatted_address
  }
}

export async function calculateDistance(
  from: Coordinates,
  to: Coordinates,
  provider: APIProvider,
  apiKey?: string
): Promise<{ distance: number; duration: number } | { error: string }> {
  try {
    if (provider === 'nominatim') {
      return await calculateDistanceOSRM(from, to)
    } else if (provider === 'google' && apiKey) {
      return await calculateDistanceGoogle(from, to, apiKey)
    } else {
      return { error: 'Invalid API configuration' }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Distance calculation failed' }
  }
}

async function calculateDistanceOSRM(
  from: Coordinates,
  to: Coordinates
): Promise<{ distance: number; duration: number }> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('OSRM routing error')
  }

  const data = await response.json()

  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error('No route found')
  }

  const route = data.routes[0]
  return {
    distance: Math.round(route.distance / 1000),
    duration: Math.round(route.duration / 60)
  }
}

async function calculateDistanceGoogle(
  from: Coordinates,
  to: Coordinates,
  apiKey: string
): Promise<{ distance: number; duration: number }> {
  const url = 'https://maps.googleapis.com/maps/api/directions/json?' + new URLSearchParams({
    origin: `${from.lat},${from.lon}`,
    destination: `${to.lat},${to.lon}`,
    key: apiKey
  })

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Google Directions API error')
  }

  const data = await response.json()

  if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
    throw new Error(data.error_message || 'No route found')
  }

  const route = data.routes[0]
  const leg = route.legs[0]

  return {
    distance: Math.round(leg.distance.value / 1000),
    duration: Math.round(leg.duration.value / 60)
  }
}

export function formatDuration(minutes: number, hoursLabel: string, minutesLabel: string): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  
  if (hours === 0) {
    return `${mins} ${minutesLabel}`
  } else if (mins === 0) {
    return `${hours} ${hoursLabel}`
  } else {
    return `${hours} ${hoursLabel} ${mins} ${minutesLabel}`
  }
}
