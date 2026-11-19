import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryServiceClient } from '@/lib/delivery/inhouse';

export const dynamic = 'force-dynamic';

const GOOGLE_ROUTES_URL =
  'https://routes.googleapis.com/directions/v2:computeRoutes';
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

// Best-effort in-memory throttle so the public endpoint cannot be used to
// exhaust the paid Google Maps quota.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// A route is considered rush-hour traffic when Google's traffic-aware
// duration is at least 25% slower than the free-flow duration.
const RUSH_TRAFFIC_RATIO = 1.25;
const INDIA_TIME_ZONE = 'Asia/Kolkata';
// Fallback rush windows (IST) used only when Google omits staticDuration.
const RUSH_HOUR_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [12, 15],
  [19, 23],
];

function isRushByClock(date: Date = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: INDIA_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date)
  );
  return RUSH_HOUR_WINDOWS.some(([start, end]) => hour >= start && hour < end);
}

function isRushTraffic(durationSeconds: number, staticSeconds: number): boolean {
  if (durationSeconds <= 0 || staticSeconds <= 0) return isRushByClock();
  return durationSeconds / staticSeconds >= RUSH_TRAFFIC_RATIO;
}

function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return true;
  bucket.count += 1;
  return false;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildAddress(parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p || '').trim()).filter(Boolean).join(', ');
}

async function geocode(
  address: string,
  apiKey: string
): Promise<{ lat: number; lng: number } | null> {
  const url = `${GOOGLE_GEOCODE_URL}?address=${encodeURIComponent(
    address
  )}&key=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  if (data?.status !== 'OK' || !data.results?.length) return null;
  const location = data.results[0]?.geometry?.location;
  if (!location) return null;
  return { lat: Number(location.lat), lng: Number(location.lng) };
}

export async function POST(req: NextRequest) {
  try {
    if (isRateLimited(clientKey(req))) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again shortly.' },
        { status: 429 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'GOOGLE_MAPS_API_KEY is not configured. Add it to the server environment.',
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const restaurantId = body.restaurantId || body.restaurant_id;
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'restaurantId required' },
        { status: 400 }
      );
    }

    const supabase = getDeliveryServiceClient();

    const { data: param, error: paramError } = await supabase
      .from('parameters')
      .select(
        'restaurant_id, restaurant_name, latitude, longitude, address_line1, address_line2, address_line3'
      )
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (paramError) throw paramError;
    if (!param) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    let originLat = toNumber(param.latitude);
    let originLng = toNumber(param.longitude);

    if (originLat === null || originLng === null) {
      const restaurantAddress = buildAddress([
        param.address_line1,
        param.address_line2,
        param.address_line3,
      ]);
      if (!restaurantAddress) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Restaurant location is not configured. Add latitude/longitude or an address in Settings.',
          },
          { status: 400 }
        );
      }
      const geo = await geocode(restaurantAddress, apiKey);
      if (!geo) {
        return NextResponse.json(
          {
            success: false,
            error: 'Could not locate the restaurant address on the map.',
          },
          { status: 422 }
        );
      }
      originLat = geo.lat;
      originLng = geo.lng;
      // Persist so the address only needs geocoding once.
      await supabase
        .from('parameters')
        .update({ latitude: geo.lat, longitude: geo.lng })
        .eq('restaurant_id', restaurantId);
    }

    let customerLat = toNumber(body.customerLat ?? body.customer_latitude);
    let customerLng = toNumber(body.customerLng ?? body.customer_longitude);

    if (customerLat === null || customerLng === null) {
      const customerAddress = (
        body.customerAddress ||
        body.customer_address ||
        ''
      ).trim();
      if (!customerAddress) {
        return NextResponse.json(
          {
            success: false,
            error: 'Customer location or address required',
          },
          { status: 400 }
        );
      }
      const geo = await geocode(customerAddress, apiKey);
      if (!geo) {
        return NextResponse.json(
          {
            success: false,
            error: 'Could not locate the delivery address on the map.',
          },
          { status: 422 }
        );
      }
      customerLat = geo.lat;
      customerLng = geo.lng;
    }

    const routeRes = await fetch(GOOGLE_ROUTES_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'routes.distanceMeters,routes.duration,routes.staticDuration',
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: { latitude: originLat, longitude: originLng },
          },
        },
        destination: {
          location: {
            latLng: { latitude: customerLat, longitude: customerLng },
          },
        },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        units: 'METRIC',
      }),
    });

    const route = await routeRes.json();

    if (!routeRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            route?.error?.message ||
            `Route lookup failed (${routeRes.status})`,
        },
        { status: 422 }
      );
    }

    const best = route?.routes?.[0];
    if (!best) {
      return NextResponse.json(
        { success: false, error: 'No driving route found' },
        { status: 422 }
      );
    }

    const meters = Number(best.distanceMeters || 0);
    // Routes API returns duration as a protobuf duration string, e.g. "1234s".
    const seconds = Number(String(best.duration || '0s').replace(/s$/, '')) || 0;
    // staticDuration is the same route without live traffic, so the ratio tells
    // us how congested the roads are right now.
    const staticSeconds =
      Number(String(best.staticDuration || '0s').replace(/s$/, '')) || 0;

    return NextResponse.json({
      success: true,
      distanceKm: Math.round(meters / 10) / 100,
      durationMinutes: Math.ceil(seconds / 60),
      isRush: isRushTraffic(seconds, staticSeconds),
      trafficRatio:
        staticSeconds > 0 ? Math.round((seconds / staticSeconds) * 100) / 100 : null,
      origin: { lat: originLat, lng: originLng },
      customer: { lat: customerLat, lng: customerLng },
      customerLat,
      customerLng,
    });
  } catch (err: any) {
    console.error('Distance calculation error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
