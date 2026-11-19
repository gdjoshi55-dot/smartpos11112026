'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogIn, User } from 'lucide-react';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';

export default function CustomerNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { customer, loading, logout } = useCustomerAuth();

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-100" />;
  }

  if (!customer) {
    const next =
      pathname && pathname !== '/customer/login'
        ? `?next=${encodeURIComponent(pathname)}`
        : '';
    return (
      <Link
        href={`/customer/login${next}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E5FE8] px-3 py-2 text-sm font-semibold text-[#1E5FE8] transition-colors hover:bg-[#EBF3FE]"
      >
        <LogIn className="h-4 w-4" />
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/customer/account"
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF3FE] px-3 py-2 text-sm font-semibold text-[#1E5FE8] hover:bg-blue-100"
      >
        <User className="h-4 w-4" />
        <span className="max-w-[120px] truncate">
          {customer.name.split(' ')[0] || 'Account'}
        </span>
      </Link>
      <button
        type="button"
        onClick={async () => {
          await logout();
          router.refresh();
        }}
        className="hidden rounded-lg px-2 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 sm:inline-flex"
      >
        Sign out
      </button>
    </div>
  );
}
