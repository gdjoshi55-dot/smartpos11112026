import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryServiceClient } from '@/lib/delivery/inhouse';
import {
  attachCustomerCookie,
  linkCustomerHistory,
  normalizeEmail,
  toPublicCustomer,
  verifyPassword,
} from '@/lib/customer-auth';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (bucket.count >= MAX_ATTEMPTS) return true;
  bucket.count += 1;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(String(body.email || ''));
    const password = String(body.password || '');

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
    if (rateLimited(`${ip}:${email}`)) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again in a minute.' },
        { status: 429 }
      );
    }

    const admin = getDeliveryServiceClient();
    const { data, error } = await admin
      .from('customer_accounts')
      .select('id, email, name, phone, address, created_at, password_hash')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;

    if (!data || !verifyPassword(password, data.password_hash)) {
      return NextResponse.json(
        { error: 'Incorrect email or password' },
        { status: 401 }
      );
    }

    await linkCustomerHistory(admin, { id: data.id, email: data.email });

    const res = NextResponse.json({
      success: true,
      customer: toPublicCustomer(data as any),
    });
    return attachCustomerCookie(res, data.id);
  } catch (err: any) {
    console.error('Customer login error:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not sign in' },
      { status: 500 }
    );
  }
}
