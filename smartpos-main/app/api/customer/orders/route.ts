import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryServiceClient } from '@/lib/delivery/inhouse';
import { getSessionAccountId } from '@/lib/customer-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const accountId = getSessionAccountId(req);
    if (!accountId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const admin = getDeliveryServiceClient();
    const { data: orders, error } = await admin
      .from('orders')
      .select('*')
      .eq('customer_account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const rows = (orders || []) as any[];
    if (rows.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    const restaurantIds = Array.from(
      new Set(rows.map((o) => o.restaurant_id).filter(Boolean))
    );
    const { data: params } = await admin
      .from('parameters')
      .select('restaurant_id, restaurant_name, currency')
      .in('restaurant_id', restaurantIds);

    const restaurantMap: Record<
      string,
      { name: string; currency: string | null }
    > = {};
    ((params || []) as any[]).forEach((p) => {
      restaurantMap[p.restaurant_id] = {
        name: p.restaurant_name,
        currency: p.currency,
      };
    });

    const orderIds = rows.map((o) => o.id);
    const { data: assignments } = await admin
      .from('delivery_assignments')
      .select('order_id, status, rider_id')
      .in('order_id', orderIds);

    const assignmentMap: Record<
      number,
      { status: string; rider_id: string | null }
    > = {};
    ((assignments || []) as any[]).forEach((a) => {
      assignmentMap[a.order_id] = { status: a.status, rider_id: a.rider_id };
    });

    const riderIds = Array.from(
      new Set(
        ((assignments || []) as any[])
          .map((a) => a.rider_id)
          .filter(Boolean)
      )
    ) as string[];

    const riderMap: Record<
      string,
      { name: string; phone: string | null; vehicle_number: string | null }
    > = {};
    if (riderIds.length > 0) {
      const { data: riders } = await admin
        .from('users')
        .select('id, name, phone, vehicle_number')
        .in('id', riderIds);
      ((riders || []) as any[]).forEach((r) => {
        riderMap[r.id] = {
          name: r.name,
          phone: r.phone,
          vehicle_number: r.vehicle_number,
        };
      });
    }

    const activeOrderIds = rows
      .filter((o) => {
        const assignment = assignmentMap[o.id];
        return (
          assignment &&
          !['delivered', 'cancelled'].includes(assignment.status)
        );
      })
      .map((o) => o.id);

    const locationMap: Record<
      number,
      { latitude: number; longitude: number; recorded_at: string }
    > = {};
    if (activeOrderIds.length > 0) {
      const { data: locations } = await admin
        .from('rider_locations')
        .select('order_id, latitude, longitude, recorded_at')
        .in('order_id', activeOrderIds)
        .order('recorded_at', { ascending: false });
      ((locations || []) as any[]).forEach((loc) => {
        if (loc.order_id != null && !locationMap[loc.order_id]) {
          locationMap[loc.order_id] = {
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            recorded_at: loc.recorded_at,
          };
        }
      });
    }

    const enriched = rows.map((order) => {
      const restaurant = restaurantMap[order.restaurant_id];
      const assignment = assignmentMap[order.id];
      const rider = assignment?.rider_id
        ? riderMap[assignment.rider_id]
        : undefined;
      return {
        ...order,
        restaurant_name: restaurant?.name || order.restaurant_id,
        currency: restaurant?.currency || 'INR',
        assignment_status: assignment?.status || null,
        rider_name: rider?.name || null,
        rider_phone: rider?.phone || null,
        rider_vehicle: rider?.vehicle_number || null,
        rider_location: locationMap[order.id] || null,
      };
    });

    return NextResponse.json({ orders: enriched });
  } catch (err: any) {
    console.error('Customer orders error:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not load your orders' },
      { status: 500 }
    );
  }
}
