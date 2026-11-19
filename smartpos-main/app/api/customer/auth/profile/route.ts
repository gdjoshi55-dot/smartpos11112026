import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryServiceClient } from '@/lib/delivery/inhouse';
import {
  getSessionAccountId,
  toPublicCustomer,
} from '@/lib/customer-auth';

export async function PATCH(req: NextRequest) {
  try {
    const accountId = getSessionAccountId(req);
    if (!accountId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (name.length < 2) {
        return NextResponse.json(
          { error: 'Please enter your name' },
          { status: 400 }
        );
      }
      updates.name = name;
    }
    if (body.phone !== undefined) {
      updates.phone = String(body.phone || '').trim() || null;
    }
    if (body.address !== undefined) {
      updates.address = String(body.address || '').trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Nothing to update' },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const admin = getDeliveryServiceClient();
    const { data, error } = await admin
      .from('customer_accounts')
      .update(updates)
      .eq('id', accountId)
      .select('id, email, name, phone, address, created_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      customer: toPublicCustomer(data as any),
    });
  } catch (err: any) {
    console.error('Customer profile update error:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not update your profile' },
      { status: 500 }
    );
  }
}
