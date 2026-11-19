'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Store,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/restaurants';
  const { customer, loading, login, register, logout } = useCustomerAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && customer) {
      router.replace(next);
    }
  }, [customer, loading, next, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    if (mode === 'register' && password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        toast.success('Signed in');
      } else {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        });
        toast.success('Account created');
      }
      router.replace(next);
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EBF3FE]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1E5FE8]" />
      </div>
    );
  }

  if (customer) {
    return (
      <div className="min-h-screen bg-[#EBF3FE] flex flex-col">
        <CustomerHeader />
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-xl">
            <p className="text-sm text-gray-500">Signed in as</p>
            <p className="mt-1 text-xl font-bold text-[#0B1B3A]">
              {customer.name}
            </p>
            <p className="text-sm text-gray-500">{customer.email}</p>
            <div className="mt-6 space-y-3">
              <Link
                href="/restaurants"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E5FE8] py-3 font-semibold text-white hover:bg-blue-700"
              >
                Find a restaurant <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/customer/account"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-3 font-semibold text-gray-700 hover:bg-gray-50"
              >
                My orders & profile
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  toast.success('Signed out');
                }}
                className="w-full rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EBF3FE] flex flex-col">
      <CustomerHeader />

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-xl sm:p-8">
          <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
                mode === 'login'
                  ? 'bg-white text-[#0B1B3A] shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
                mode === 'register'
                  ? 'bg-white text-[#0B1B3A] shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              Create account
            </button>
          </div>

          <h1 className="text-2xl font-bold text-[#0B1B3A]">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mb-6 mt-1 text-sm text-gray-500">
            {mode === 'login'
              ? 'Sign in to reorder faster and track your deliveries.'
              : 'Save your details, order from any restaurant, and collect loyalty points.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Full name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Your name"
                    className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
                />
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Phone <span className="text-gray-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Mobile number"
                      className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Delivery address <span className="text-gray-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      rows={2}
                      placeholder="House / street / area"
                      className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  placeholder="At least 6 characters"
                  className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
                />
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E5FE8] py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'login' ? (
                'Sign in'
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-gray-400">
            Just browsing?{' '}
            <Link href="/restaurants" className="font-medium text-[#1E5FE8]">
              Browse restaurants as a guest
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function CustomerHeader() {
  return (
    <header className="border-b border-gray-100 bg-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 lg:px-6">
        <Link href="/restaurants" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#1E5FE8]">
            <Store className="h-5 w-5 text-[#1E5FE8]" />
          </div>
          <div className="leading-tight">
            <span className="text-lg font-bold">
              <span className="text-[#0B1B3A]">Smart</span>
              <span className="text-[#1E5FE8]">POS</span>
            </span>
            <p className="-mt-0.5 text-[10px] text-gray-400">
              Restaurant Management System
            </p>
          </div>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>
    </header>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#EBF3FE]">
          <Loader2 className="h-8 w-8 animate-spin text-[#1E5FE8]" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
