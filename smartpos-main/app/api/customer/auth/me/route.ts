import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryServiceClient } from '@/lib/delivery/inhouse';
import {
  getSessionAccountId,
  toPublicCustomer,
} from '@/lib/customer-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const accountId = getSessionAccountId(req);
    if (!accountId) {
      return NextResponse.json({ customer: null, loyalty_points: 0 });
    }

    const admin = getDeliveryServiceClient();
    const { data, error } = await admin
      .from('customer_accounts')
      .select('id, email, name, phone, address, created_at')
      .eq('id', accountId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ customer: null, loyalty_points: 0 });
    }

    const { data: loyaltyRows } = await admin
      .from('customers')
      .select('loyalty_points')
      .eq('account_id', accountId);

    const loyaltyPoints = (loyaltyRows || []).reduce(
      (sum: number, row: any) => sum + Number(row.loyalty_points || 0),
      0
    );

    return NextResponse.json({
      customer: toPublicCustomer(data as any),
      loyalty_points: Math.round(loyaltyPoints * 100) / 100,
    });
  } catch (err: any) {
    console.error('Customer session error:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not load your account' },
      { status: 500 }
    );
  }
}
