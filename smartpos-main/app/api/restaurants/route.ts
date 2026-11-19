import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryServiceClient } from '@/lib/delivery/inhouse';

export const dynamic = 'force-dynamic';

const EARTH_RADIUS_KM = 6371;
const DEFAULT_RADIUS_KM = 10;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function buildAddress(parts: (string | null)[]): string {
  return parts.map((p) => (p || '').trim()).filter(Boolean).join(', ');
}

/**
 * Public restaurant directory. Returns only customer-safe fields (never MPIN,
 * passwords or payment keys). When lat/lng are supplied the list is filtered to
 * restaurants within `radiusKm` (default 10 km) using straight-line distance.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = toNumber(searchParams.get('lat'));
    const lng = toNumber(searchParams.get('lng'));
    const rawRadius = toNumber(searchParams.get('radiusKm'));
    const radiusKm =
      rawRadius === null
        ? DEFAULT_RADIUS_KM
        : Math.min(Math.max(rawRadius, 1), 50);

    const admin = getDeliveryServiceClient();
    const { data, error } = await admin
      .from('parameters')
      .select(
        'restaurant_id, restaurant_name, login_name, phone, address_line1, address_line2, address_line3, currency, delivery_mode, accepting_orders, latitude, longitude'
      )
      .order('restaurant_name', { ascending: true });

    if (error) throw error;

    const ownerLogins = [
      process.env.ALTASOFTWARE_OWNER_LOGIN,
      process.env.NEXT_PUBLIC_ALTASOFTWARE_OWNER_LOGIN,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase().trim());

    const isPlatformAdminRow = (row: any): boolean => {
      const login = String(row.login_name || '').toLowerCase().trim();
      if (login && ownerLogins.includes(login)) return true;
      return String(row.restaurant_id || '')
        .toUpperCase()
        .startsWith('OWNER');
    };

    const hasLocation = lat !== null && lng !== null;
    let skippedNoLocation = 0;

    const restaurants = ((data || []) as any[])
      .filter((row) => !isPlatformAdminRow(row))
      .map((row) => {
        const rLat = toNumber(row.latitude);
        const rLng = toNumber(row.longitude);
        const distance =
          hasLocation && rLat !== null && rLng !== null
            ? haversineKm(lat as number, lng as number, rLat, rLng)
            : null;

        return {
          restaurant_id: row.restaurant_id,
          restaurant_name: row.restaurant_name,
          phone: row.phone,
          address: buildAddress([
            row.address_line1,
            row.address_line2,
            row.address_line3,
          ]),
          currency: row.currency || 'INR',
          delivery_mode: row.delivery_mode,
          accepting_orders: row.accepting_orders !== false,
          latitude: rLat,
          longitude: rLng,
          distance_km: distance === null ? null : Math.round(distance * 10) / 10,
        };
      })
      .filter((row) => {
        if (!hasLocation) return true;
        if (row.distance_km === null) {
          skippedNoLocation += 1;
          return false;
        }
        return row.distance_km <= radiusKm;
      })
      .sort((a, b) => {
        if (a.distance_km === null && b.distance_km === null) {
          return a.restaurant_name.localeCompare(b.restaurant_name);
        }
        if (a.distance_km === null) return 1;
        if (b.distance_km === null) return -1;
        return a.distance_km - b.distance_km;
      });

    return NextResponse.json({
      restaurants,
      count: restaurants.length,
      radius_km: radiusKm,
      location_applied: hasLocation,
      skipped_no_location: skippedNoLocation,
    });
  } catch (err: any) {
    console.error('Restaurant directory error:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not load restaurants' },
      { status: 500 }
    );
  }
}
