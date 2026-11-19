import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

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

/**
 * Forward geocode (address -> lat/lng) or reverse geocode (lat/lng -> label).
 * Used by the customer restaurant discovery page.
 */
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
            'Location search is not configured. Use “Use my location” instead.',
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const lat = toNumber(body.lat ?? body.latitude);
    const lng = toNumber(body.lng ?? body.longitude);
    const address = String(body.address || '').trim();

    let query: string;
    if (lat !== null && lng !== null) {
      query = `latlng=${lat},${lng}`;
    } else if (address) {
      query = `address=${encodeURIComponent(address)}`;
    } else {
      return NextResponse.json(
        { success: false, error: 'Provide an address or coordinates' },
        { status: 400 }
      );
    }

    const url = `${GOOGLE_GEOCODE_URL}?${query}&language=en&key=${apiKey}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();

    if (data?.status === 'ZERO_RESULTS') {
      return NextResponse.json(
        { success: false, error: 'We could not find that location.' },
        { status: 422 }
      );
    }
    if (data?.status !== 'OK' || !data.results?.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            data?.error_message ||
            `Location lookup failed (${data?.status || 'unknown'}).`,
        },
        { status: 422 }
      );
    }

    const best = data.results[0];
    const location = best?.geometry?.location;
    if (!location) {
      return NextResponse.json(
        { success: false, error: 'Location lookup returned no coordinates.' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      lat: Number(location.lat),
      lng: Number(location.lng),
      label: best.formatted_address || address || `${location.lat}, ${location.lng}`,
    });
  } catch (err: any) {
    console.error('Geocode error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Location lookup failed' },
      { status: 500 }
    );
  }
}
