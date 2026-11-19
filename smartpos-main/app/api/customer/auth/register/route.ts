import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryServiceClient } from '@/lib/delivery/inhouse';
import {
  attachCustomerCookie,
  hashPassword,
  isValidEmail,
  linkCustomerHistory,
  normalizeEmail,
  toPublicCustomer,
} from '@/lib/customer-auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const email = normalizeEmail(String(body.email || ''));
    const password = String(body.password || '');
    const phone = String(body.phone || '').trim() || null;
    const address = String(body.address || '').trim() || null;

    if (name.length < 2) {
      return NextResponse.json(
        { error: 'Please enter your name' },
        { status: 400 }
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const admin = getDeliveryServiceClient();

    const { data: existing } = await admin
      .from('customer_accounts')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in.' },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .from('customer_accounts')
      .insert({
        email,
        password_hash: hashPassword(password),
        name,
        phone,
        address,
      })
      .select('id, email, name, phone, address, created_at')
      .single();

    if (error) {
      if ((error as any).code === '23505') {
        return NextResponse.json(
          { error: 'An account with this email already exists.' },
          { status: 409 }
        );
      }
      throw error;
    }

    await linkCustomerHistory(admin, { id: data.id, email: data.email });

    const res = NextResponse.json({
      success: true,
      customer: toPublicCustomer(data as any),
    });
    return attachCustomerCookie(res, data.id);
  } catch (err: any) {
    console.error('Customer register error:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not create your account' },
      { status: 500 }
    );
  }
}
