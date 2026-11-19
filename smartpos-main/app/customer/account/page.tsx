'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Phone,
  Save,
  Star,
  Store,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface CustomerOrder {
  id: number;
  restaurant_id: string;
  restaurant_name: string;
  currency: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  payment_method: string;
  status: string;
  order_type: string;
  delivery_status: string | null;
  assignment_status: string | null;
  customer_address: string | null;
  created_at: string;
  estimated_delivery_time: number | null;
  rider_name: string | null;
  rider_phone: string | null;
  rider_vehicle: string | null;
  rider_location: {
    latitude: number;
    longitude: number;
    recorded_at: string;
  } | null;
}

const ACTIVE_STATUSES = ['pending', 'in_progress', 'settled'];

function isActiveOrder(order: CustomerOrder) {
  if (order.assignment_status) {
    return !['delivered', 'cancelled'].includes(order.assignment_status);
  }
  return ACTIVE_STATUSES.includes(order.status);
}

function statusBadge(order: CustomerOrder) {
  const status = order.assignment_status || order.delivery_status || order.status;
  switch (status) {
    case 'delivered':
    case 'completed':
      return { label: 'Delivered', className: 'bg-emerald-100 text-emerald-800' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-red-100 text-red-800' };
    case 'picked_up':
    case 'out_for_delivery':
      return { label: 'On the way', className: 'bg-indigo-100 text-indigo-800' };
    case 'accepted':
    case 'assigned':
      return { label: 'Rider assigned', className: 'bg-blue-100 text-blue-800' };
    case 'in_progress':
      return { label: 'Preparing', className: 'bg-amber-100 text-amber-800' };
    case 'settled':
    case 'pending':
      return { label: 'Order placed', className: 'bg-gray-100 text-gray-700' };
    default:
      return { label: status || 'Placed', className: 'bg-gray-100 text-gray-700' };
  }
}

export default function CustomerAccountPage() {
  const router = useRouter();
  const {
    customer,
    loyaltyPoints,
    loading,
    logout,
    updateProfile,
    refresh,
  } = useCustomerAuth();

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!loading && !customer) {
      router.replace('/customer/login?next=/customer/account');
    }
  }, [customer, loading, router]);

  useEffect(() => {
    if (customer) {
      setName(customer.name || '');
      setPhone(customer.phone || '');
      setAddress(customer.address || '');
    }
  }, [customer]);

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setOrdersLoading(true);
    try {
      const res = await fetch('/api/customer/orders', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not load orders');
      setOrders(data.orders || []);
      setOrdersError(null);
    } catch (err: any) {
      setOrdersError(err?.message || 'Could not load orders');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!customer) return;
    loadOrders();
    const interval = setInterval(() => loadOrders(true), 20000);
    return () => clearInterval(interval);
  }, [customer, loadOrders]);

  const hasActive = useMemo(
    () => orders.some((order) => isActiveOrder(order)),
    [orders]
  );

  if (loading || (!customer && ordersLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EBF3FE]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1E5FE8]" />
      </div>
    );
  }

  if (!customer) return null;

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
      });
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err?.message || 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EBF3FE] pb-16">
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/restaurants" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#1E5FE8]">
              <Store className="h-5 w-5 text-[#1E5FE8]" />
            </div>
            <span className="text-lg font-bold">
              <span className="text-[#0B1B3A]">Smart</span>
              <span className="text-[#1E5FE8]">POS</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace('/restaurants');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">Welcome back</p>
            <h1 className="text-2xl font-bold text-[#0B1B3A]">{customer.name}</h1>
            <p className="text-sm text-gray-500">{customer.email}</p>
          </div>
          <Link
            href="/restaurants"
            className="inline-flex items-center gap-2 rounded-lg bg-[#1E5FE8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Order again <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Star className="h-4 w-4 text-amber-500" /> Loyalty points
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {loyaltyPoints.toFixed(0)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Package className="h-4 w-4 text-blue-600" /> Orders
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {orders.length}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Truck className="h-4 w-4 text-emerald-600" /> Active
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {orders.filter(isActiveOrder).length}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Your orders</h2>
              <button
                type="button"
                onClick={() => {
                  loadOrders(true);
                  refresh();
                }}
                className="text-xs font-medium text-[#1E5FE8] hover:underline"
              >
                Refresh
              </button>
            </div>

            {ordersLoading ? (
              <div className="flex items-center justify-center rounded-xl bg-white py-16 shadow-sm">
                <Loader2 className="h-6 w-6 animate-spin text-[#1E5FE8]" />
              </div>
            ) : ordersError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {ordersError}
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-xl bg-white p-10 text-center shadow-sm">
                <Package className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-700">No orders yet</p>
                <p className="mt-1 text-sm text-gray-500">
                  Find a restaurant and place your first order.
                </p>
                <Link
                  href="/restaurants"
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#1E5FE8] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Browse restaurants <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => {
                  const badge = statusBadge(order);
                  const expanded = expandedId === order.id;
                  const active = isActiveOrder(order);
                  return (
                    <div
                      key={order.id}
                      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(expanded ? null : order.id)
                        }
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">
                              {order.restaurant_name}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            {active && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                <Clock className="h-3 w-3" /> Live
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500">
                            #{order.id} · {formatDate(order.created_at)} ·{' '}
                            {order.items?.length || 0} item
                            {(order.items?.length || 0) === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-gray-900">
                            {formatCurrency(order.total, order.currency)}
                          </span>
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-gray-100 px-4 py-3">
                          <ul className="mb-3 space-y-1 text-sm">
                            {(order.items || []).map((item, index) => (
                              <li
                                key={index}
                                className="flex justify-between text-gray-700"
                              >
                                <span>
                                  {item.quantity} × {item.name}
                                </span>
                                <span className="text-gray-500">
                                  {formatCurrency(
                                    item.price * item.quantity,
                                    order.currency
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>

                          <div className="space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
                            <p className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              {order.order_type} ·{' '}
                              {order.payment_method === 'cash'
                                ? 'Cash on delivery'
                                : 'Paid online'}
                            </p>
                            {order.customer_address && (
                              <p className="flex items-start gap-1.5">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                {order.customer_address}
                              </p>
                            )}
                            {order.estimated_delivery_time && active && (
                              <p className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                Estimated {order.estimated_delivery_time} min
                              </p>
                            )}
                          </div>

                          {active && (
                            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                              {order.rider_name ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-800">
                                  <span className="inline-flex items-center gap-1.5 font-medium">
                                    <Bike className="h-3.5 w-3.5" />
                                    {order.rider_name}
                                    {order.rider_vehicle
                                      ? ` · ${order.rider_vehicle}`
                                      : ''}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {order.rider_location && (
                                      <a
                                        href={`https://www.google.com/maps?q=${order.rider_location.latitude},${order.rider_location.longitude}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-blue-700 hover:bg-blue-100"
                                      >
                                        <MapPin className="h-3 w-3" /> Live map
                                      </a>
                                    )}
                                    {order.rider_phone && (
                                      <a
                                        href={`tel:${order.rider_phone}`}
                                        className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-blue-700 hover:bg-blue-100"
                                      >
                                        <Phone className="h-3 w-3" /> Call
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-blue-800">
                                  We&apos;ll assign a rider shortly. Keep this
                                  page open for live updates.
                                </p>
                              )}
                            </div>
                          )}

                          {!active && (
                            <div className="mt-3 flex items-center justify-between text-xs">
                              {['delivered', 'completed'].includes(
                                order.assignment_status ||
                                  order.delivery_status ||
                                  order.status
                              ) ? (
                                <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Completed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-medium text-red-600">
                                  <XCircle className="h-3.5 w-3.5" />
                                  Closed
                                </span>
                              )}
                              <Link
                                href={`/order/${encodeURIComponent(
                                  order.restaurant_id || ''
                                )}`}
                                className="inline-flex items-center gap-1 font-medium text-[#1E5FE8] hover:underline"
                              >
                                Reorder <ArrowRight className="h-3 w-3" />
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {hasActive && (
              <p className="mt-3 text-center text-xs text-gray-400">
                Live updates every 20 seconds.
              </p>
            )}
          </section>

          <aside>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                <User className="h-4 w-4 text-[#1E5FE8]" /> Saved details
              </h2>
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Delivery address
                  </label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E5FE8] py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save details
                </button>
              </form>
              <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
                These details are pre-filled at checkout. Loyalty points are
                summed across restaurants where you&apos;ve ordered while signed
                in.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <div className="mx-auto max-w-4xl px-4">
        <Link
          href="/restaurants"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" /> Browse restaurants
        </Link>
      </div>
    </div>
  );
}
