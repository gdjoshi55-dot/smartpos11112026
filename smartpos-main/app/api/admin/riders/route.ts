import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertOwner } from '@/app/api/admin/_auth';

export const dynamic = 'force-dynamic';

const DOCUMENT_BUCKET = 'rider-documents';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const RIDER_SELECT =
  'id, restaurant_id, name, login_name, phone, vehicle_number, rider_status, active, approval_status, aadhaar_number, pan_number, driving_license_number, police_verification_number, aadhaar_document_path, pan_document_path, driving_license_document_path, police_verification_document_path, documents_verified, documents_verified_at, documents_verified_by, created_at';

const DOCUMENT_FIELDS = [
  {
    key: 'aadhaar',
    number: 'aadhaar_number',
    path: 'aadhaar_document_path',
    label: 'Aadhaar',
  },
  {
    key: 'pan',
    number: 'pan_number',
    path: 'pan_document_path',
    label: 'PAN',
  },
  {
    key: 'driving_license',
    number: 'driving_license_number',
    path: 'driving_license_document_path',
    label: 'Driving license',
  },
  {
    key: 'police_verification',
    number: 'police_verification_number',
    path: 'police_verification_document_path',
    label: 'Police verification record',
  },
] as const;

function missingDocumentLabels(rider: Record<string, any>): string[] {
  return DOCUMENT_FIELDS.filter(
    (field) => !rider[field.number] || !rider[field.path]
  ).map((field) => field.label);
}

async function attachSignedDocuments(admin: any, riders: any[]) {
  const paths: string[] = [];
  for (const rider of riders) {
    for (const field of DOCUMENT_FIELDS) {
      const path = rider[field.path];
      if (path) paths.push(path);
    }
  }

  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await admin.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const item of data || []) {
      if (item?.path && item?.signedUrl) {
        signedByPath.set(item.path, item.signedUrl);
      }
    }
  }

  return riders.map((rider) => {
    const documents: Record<string, string | null> = {};
    for (const field of DOCUMENT_FIELDS) {
      const path = rider[field.path];
      documents[field.key] = path ? signedByPath.get(path) || null : null;
    }
    return {
      ...rider,
      documents,
      missing_documents: missingDocumentLabels(rider),
    };
  });
}

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      global: {
        fetch: (input: any, init?: any) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  );
}

export async function GET(req: NextRequest) {
  try {
    const auth = await assertOwner(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from('users')
      .select(RIDER_SELECT)
      .eq('role', 'rider')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const riders = data || [];
    const rank: Record<string, number> = {
      pending: 0,
      approved: 1,
      rejected: 2,
    };
    riders.sort((a: any, b: any) => {
      const ra = rank[a.approval_status || 'approved'] ?? 3;
      const rb = rank[b.approval_status || 'approved'] ?? 3;
      if (ra !== rb) return ra - rb;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    const ridersWithDocuments = await attachSignedDocuments(admin, riders);

    // Platform rider pay configuration + per-rider payout totals.
    const { data: settingsRow } = await admin
      .from('platform_settings')
      .select(
        'rider_base_pay, rider_per_km, rider_free_km, rider_long_trip_km, rider_long_trip_bonus, rider_surge_percent, rider_incentive_target_orders, rider_incentive_weekday, rider_incentive_weekend'
      )
      .eq('id', 1)
      .maybeSingle();

    const riderIds = riders.map((r: any) => r.id);
    const payoutByRider: Record<
      string,
      { pending: number; paid: number; deliveries: number }
    > = {};

    if (riderIds.length > 0) {
      const { data: assignmentRows } = await admin
        .from('delivery_assignments')
        .select('rider_id, payout_amount, payout_status')
        .in('rider_id', riderIds)
        .eq('status', 'delivered');

      for (const row of (assignmentRows || []) as any[]) {
        const key = row.rider_id as string;
        if (!key) continue;
        if (!payoutByRider[key]) {
          payoutByRider[key] = { pending: 0, paid: 0, deliveries: 0 };
        }
        const amount = Number(row.payout_amount || 0);
        payoutByRider[key].deliveries += 1;
        if (row.payout_status === 'paid') {
          payoutByRider[key].paid += amount;
        } else {
          payoutByRider[key].pending += amount;
        }
      }
    }

    const ridersWithPayouts = ridersWithDocuments.map((rider: any) => {
      const payout = payoutByRider[rider.id] || {
        pending: 0,
        paid: 0,
        deliveries: 0,
      };
      return {
        ...rider,
        pending_payout: Math.round(payout.pending * 100) / 100,
        paid_payout: Math.round(payout.paid * 100) / 100,
        delivery_count: payout.deliveries,
      };
    });

    return NextResponse.json({
      riders: ridersWithPayouts,
      settings: {
        rider_base_pay: Number(settingsRow?.rider_base_pay || 0),
        rider_per_km: Number(settingsRow?.rider_per_km || 0),
        rider_free_km: Number(settingsRow?.rider_free_km || 0),
        rider_long_trip_km: Number(settingsRow?.rider_long_trip_km || 0),
        rider_long_trip_bonus: Number(settingsRow?.rider_long_trip_bonus || 0),
        rider_surge_percent: Number(settingsRow?.rider_surge_percent || 0),
        rider_incentive_target_orders: Number(
          settingsRow?.rider_incentive_target_orders || 0
        ),
        rider_incentive_weekday: Number(
          settingsRow?.rider_incentive_weekday || 0
        ),
        rider_incentive_weekend: Number(
          settingsRow?.rider_incentive_weekend || 0
        ),
      },
      counts: {
        total: riders.length,
        pending: riders.filter(
          (r: any) => (r.approval_status || 'approved') === 'pending'
        ).length,
        approved: riders.filter(
          (r: any) =>
            (r.approval_status || 'approved') === 'approved' && r.active
        ).length,
        online: riders.filter(
          (r: any) =>
            (r.approval_status || 'approved') === 'approved' &&
            r.active &&
            r.rider_status === 'available'
        ).length,
      },
    });
  } catch (err: any) {
    console.error('Admin riders list error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await assertOwner(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = String(body.id || '').trim();
    const action = String(body.action || '').trim();

    const admin = getAdminClient();
    const now = new Date().toISOString();

    if (action === 'update-settings') {
      const basePay = Number(body.rider_base_pay ?? body.riderBasePay ?? 0);
      const perKm = Number(body.rider_per_km ?? body.riderPerKm ?? 0);
      const freeKm = Number(body.rider_free_km ?? body.riderFreeKm ?? 3.5);
      const longTripKm = Number(
        body.rider_long_trip_km ?? body.riderLongTripKm ?? 10
      );
      const longTripBonus = Number(
        body.rider_long_trip_bonus ?? body.riderLongTripBonus ?? 25
      );
      const surgePercent = Number(
        body.rider_surge_percent ?? body.riderSurgePercent ?? 30
      );
      const incentiveTarget = Math.round(
        Number(
          body.rider_incentive_target_orders ??
            body.riderIncentiveTargetOrders ??
            10
        )
      );
      const incentiveWeekday = Number(
        body.rider_incentive_weekday ?? body.riderIncentiveWeekday ?? 350
      );
      const incentiveWeekend = Number(
        body.rider_incentive_weekend ?? body.riderIncentiveWeekend ?? 400
      );
      const perKmRush = Number(
        body.rider_per_km_rush ?? body.riderPerKmRush ?? NaN
      );
      const numericValues = [
        basePay,
        perKm,
        freeKm,
        longTripKm,
        longTripBonus,
        surgePercent,
        incentiveTarget,
        incentiveWeekday,
        incentiveWeekend,
      ];
      if (
        numericValues.some((value) => !Number.isFinite(value) || value < 0)
      ) {
        return NextResponse.json(
          { error: 'Invalid payout settings' },
          { status: 400 }
        );
      }
      const { data: settings, error: settingsError } = await admin
        .from('platform_settings')
        .update({
          rider_base_pay: basePay,
          rider_per_km: perKm,
          rider_free_km: freeKm,
          rider_long_trip_km: longTripKm,
          rider_long_trip_bonus: longTripBonus,
          rider_surge_percent: surgePercent,
          rider_incentive_target_orders: incentiveTarget,
          rider_incentive_weekday: incentiveWeekday,
          rider_incentive_weekend: incentiveWeekend,
          ...(Number.isFinite(perKmRush) && perKmRush >= 0
            ? { rider_per_km_rush: perKmRush }
            : {}),
          updated_at: now,
        })
        .eq('id', 1)
        .select(
          'rider_base_pay, rider_per_km, rider_free_km, rider_long_trip_km, rider_long_trip_bonus, rider_surge_percent, rider_incentive_target_orders, rider_incentive_weekday, rider_incentive_weekend'
        )
        .maybeSingle();
      if (settingsError) throw settingsError;
      return NextResponse.json({ success: true, settings });
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    if (action === 'mark-paid') {
      const { data: updated, error: payoutError } = await admin
        .from('delivery_assignments')
        .update({ payout_status: 'paid', paid_at: now })
        .eq('rider_id', id)
        .eq('status', 'delivered')
        .eq('payout_status', 'pending')
        .select('id');
      if (payoutError) throw payoutError;
      return NextResponse.json({
        success: true,
        updated: (updated || []).length,
      });
    }

    if (action === 'approve' || action === 'verify') {
      const { data: current, error: fetchError } = await admin
        .from('users')
        .select(RIDER_SELECT)
        .eq('id', id)
        .eq('role', 'rider')
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!current) {
        return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
      }

      const missing = missingDocumentLabels(current);
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Cannot ${action} rider: missing ${missing.join(', ')}`,
          },
          { status: 400 }
        );
      }

      if (action === 'approve' && !current.documents_verified) {
        return NextResponse.json(
          {
            error:
              'Verify all four rider documents before approving this rider',
          },
          { status: 400 }
        );
      }
    }

    const ownerLogin = (req.headers.get('x-login-name') || '').trim();

    const patches: Record<string, Record<string, unknown>> = {
      approve: {
        approval_status: 'approved',
        active: true,
        rider_status: 'offline',
      },
      reject: {
        approval_status: 'rejected',
        active: false,
        rider_status: 'offline',
      },
      activate: { active: true },
      deactivate: { active: false, rider_status: 'offline' },
      verify: {
        documents_verified: true,
        documents_verified_at: now,
        documents_verified_by: ownerLogin || 'owner',
      },
      unverify: {
        documents_verified: false,
        documents_verified_at: null,
        documents_verified_by: null,
      },
    };

    const patch = patches[action];
    if (!patch) {
      return NextResponse.json(
        {
          error:
            'action must be approve, reject, activate, deactivate, verify, unverify, mark-paid or update-settings',
        },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from('users')
      .update(patch)
      .eq('id', id)
      .eq('role', 'rider')
      .select(RIDER_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, rider: data });
  } catch (err: any) {
    console.error('Admin rider update error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
