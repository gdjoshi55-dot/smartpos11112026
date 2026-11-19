'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Bike,
  Check,
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  UserX,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AdminRider {
  id: string;
  restaurant_id: string | null;
  name: string;
  login_name: string;
  phone: string | null;
  vehicle_number: string | null;
  rider_status: string | null;
  active: boolean;
  approval_status: string | null;
  aadhaar_number: string | null;
  pan_number: string | null;
  driving_license_number: string | null;
  police_verification_number: string | null;
  documents_verified: boolean | null;
  documents_verified_at: string | null;
  documents_verified_by: string | null;
  documents?: {
    aadhaar: string | null;
    pan: string | null;
    driving_license: string | null;
    police_verification: string | null;
  };
  missing_documents?: string[];
  pending_payout?: number;
  paid_payout?: number;
  delivery_count?: number;
  created_at: string;
}

const DOCUMENT_ROWS = [
  { key: 'aadhaar', numberKey: 'aadhaar_number', label: 'Aadhaar' },
  { key: 'pan', numberKey: 'pan_number', label: 'PAN' },
  {
    key: 'driving_license',
    numberKey: 'driving_license_number',
    label: 'Driving license',
  },
  {
    key: 'police_verification',
    numberKey: 'police_verification_number',
    label: 'Police verification record',
  },
] as const;

type RiderFilter = 'pending' | 'approved' | 'all';

function approvalOf(rider: AdminRider): string {
  return rider.approval_status || 'approved';
}

function statusBadge(rider: AdminRider) {
  const approval = approvalOf(rider);
  if (approval === 'pending') {
    return {
      label: 'Pending approval',
      className: 'bg-amber-100 text-amber-800',
    };
  }
  if (approval === 'rejected') {
    return {
      label: 'Rejected',
      className: 'bg-red-100 text-red-800',
    };
  }
  if (!rider.active) {
    return { label: 'Deactivated', className: 'bg-gray-200 text-gray-700' };
  }
  if (rider.rider_status === 'available') {
    return { label: 'Online', className: 'bg-emerald-100 text-emerald-800' };
  }
  if (rider.rider_status === 'busy') {
    return { label: 'On delivery', className: 'bg-indigo-100 text-indigo-800' };
  }
  return { label: 'Offline', className: 'bg-gray-100 text-gray-700' };
}

export default function RidersPanel() {
  const { restaurant, user } = useAuth();
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    online: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RiderFilter>('pending');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [basePay, setBasePay] = useState('30');
  const [perKm, setPerKm] = useState('15');
  const [freeKm, setFreeKm] = useState('3.5');
  const [longTripKm, setLongTripKm] = useState('10');
  const [longTripBonus, setLongTripBonus] = useState('25');
  const [surgePercent, setSurgePercent] = useState('30');
  const [incentiveTarget, setIncentiveTarget] = useState('10');
  const [incentiveWeekday, setIncentiveWeekday] = useState('350');
  const [incentiveWeekend, setIncentiveWeekend] = useState('400');
  const [savingSettings, setSavingSettings] = useState(false);

  const adminHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-login-name': user?.login_name || '',
      'x-restaurant-id': restaurant?.restaurant_id || '',
    }),
    [user?.login_name, restaurant?.restaurant_id]
  );

  const loadRiders = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const res = await fetch('/api/admin/riders', {
          headers: adminHeaders,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load riders');
        }
        setRiders(data.riders || []);
        setCounts(
          data.counts || { total: 0, pending: 0, approved: 0, online: 0 }
        );
        if (!silent && data.settings) {
          setBasePay(String(data.settings.rider_base_pay ?? 30));
          setPerKm(String(data.settings.rider_per_km ?? 15));
          setFreeKm(String(data.settings.rider_free_km ?? 3.5));
          setLongTripKm(String(data.settings.rider_long_trip_km ?? 10));
          setLongTripBonus(
            String(data.settings.rider_long_trip_bonus ?? 25)
          );
          setSurgePercent(String(data.settings.rider_surge_percent ?? 30));
          setIncentiveTarget(
            String(data.settings.rider_incentive_target_orders ?? 10)
          );
          setIncentiveWeekday(
            String(data.settings.rider_incentive_weekday ?? 350)
          );
          setIncentiveWeekend(
            String(data.settings.rider_incentive_weekend ?? 400)
          );
        }
        setError(null);
      } catch (err: any) {
        console.error('Error loading riders:', err);
        setError(err?.message || 'Failed to load riders');
        if (!silent) toast.error(err?.message || 'Failed to load riders');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [adminHeaders]
  );

  useEffect(() => {
    loadRiders();
    const interval = setInterval(() => loadRiders(true), 30000);
    return () => clearInterval(interval);
  }, [loadRiders]);

  const updateRider = async (rider: AdminRider, action: string) => {
    setUpdatingId(rider.id);
    try {
      const res = await fetch('/api/admin/riders', {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ id: rider.id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update rider');
      }
      const messages: Record<string, string> = {
        approve: `${rider.name} approved`,
        reject: `${rider.name} rejected`,
        activate: `${rider.name} activated`,
        deactivate: `${rider.name} deactivated`,
        verify: `${rider.name} documents verified`,
        unverify: `${rider.name} documents marked unverified`,
      };
      toast.success(messages[action] || 'Rider updated');
      await loadRiders(true);
    } catch (err: any) {
      console.error('Error updating rider:', err);
      toast.error(err?.message || 'Failed to update rider');
    } finally {
      setUpdatingId(null);
    }
  };

  const saveSettings = async () => {
    const basePayValue = Number(basePay);
    const perKmValue = Number(perKm);
    const freeKmValue = Number(freeKm);
    const longTripKmValue = Number(longTripKm);
    const longTripBonusValue = Number(longTripBonus);
    const surgePercentValue = Number(surgePercent);
    const incentiveTargetValue = Math.round(Number(incentiveTarget));
    const incentiveWeekdayValue = Number(incentiveWeekday);
    const incentiveWeekendValue = Number(incentiveWeekend);
    const values = [
      basePayValue,
      perKmValue,
      freeKmValue,
      longTripKmValue,
      longTripBonusValue,
      surgePercentValue,
      incentiveTargetValue,
      incentiveWeekdayValue,
      incentiveWeekendValue,
    ];
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      toast.error('Enter valid non-negative payout values');
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/riders', {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          action: 'update-settings',
          rider_base_pay: basePayValue,
          rider_per_km: perKmValue,
          rider_free_km: freeKmValue,
          rider_long_trip_km: longTripKmValue,
          rider_long_trip_bonus: longTripBonusValue,
          rider_surge_percent: surgePercentValue,
          rider_incentive_target_orders: incentiveTargetValue,
          rider_incentive_weekday: incentiveWeekdayValue,
          rider_incentive_weekend: incentiveWeekendValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save pay settings');
      }
      toast.success('Rider pay settings saved');
      await loadRiders(true);
    } catch (err: any) {
      console.error('Error saving rider settings:', err);
      toast.error(err?.message || 'Failed to save pay settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const markRiderPaid = async (rider: AdminRider) => {
    setMarkingPaidId(rider.id);
    try {
      const res = await fetch('/api/admin/riders', {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ id: rider.id, action: 'mark-paid' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to mark payout paid');
      }
      toast.success(
        `Marked ${data.updated || 0} deliver${
          data.updated === 1 ? 'y' : 'ies'
        } paid for ${rider.name}`
      );
      await loadRiders(true);
    } catch (err: any) {
      console.error('Error marking rider paid:', err);
      toast.error(err?.message || 'Failed to mark payout paid');
    } finally {
      setMarkingPaidId(null);
    }
  };

  const filteredRiders = useMemo(() => {
    if (filter === 'pending') {
      return riders.filter((r) => approvalOf(r) === 'pending');
    }
    if (filter === 'approved') {
      return riders.filter((r) => approvalOf(r) === 'approved');
    }
    return riders;
  }, [riders, filter]);

  const totalPending = useMemo(
    () =>
      riders.reduce((sum, r) => sum + Number(r.pending_payout || 0), 0),
    [riders]
  );
  const totalPaid = useMemo(
    () => riders.reduce((sum, r) => sum + Number(r.paid_payout || 0), 0),
    [riders]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Riders</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Approve self-registered riders and manage the SmartPOS rider pool.
            Approved riders can go online from Rider Mode and receive
            deliveries across restaurants.
          </p>
        </div>
        <button
          onClick={() => loadRiders(true)}
          disabled={refreshing}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="h-4 w-4 text-amber-600" />
            Pending approval
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.pending}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Approved
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.approved}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Bike className="h-4 w-4 text-emerald-600" />
            Online
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.online}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CheckCircle className="h-4 w-4 text-purple-600" />
            Total riders
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.total}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center text-sm font-semibold text-gray-900">
              <Wallet className="mr-2 h-4 w-4 text-emerald-600" />
              Platform rider pay
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Payout = base pay + distance pay + surge + incentives + customer
              tips. Distance pay applies only beyond the free radius, and
              rush-hour deliveries (detected from Google traffic) add the surge
              percentage.
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span className="text-gray-600">
                Pending:{' '}
                <span className="font-semibold text-amber-700">
                  ₹{totalPending.toFixed(2)}
                </span>
              </span>
              <span className="text-gray-600">
                Paid:{' '}
                <span className="font-semibold text-emerald-700">
                  ₹{totalPaid.toFixed(2)}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-gray-600">
              Base pay (₹)
              <input
                type="number"
                min={0}
                step="0.01"
                value={basePay}
                onChange={(e) => setBasePay(e.target.value)}
                className="mt-1 block w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Per km (₹)
              <input
                type="number"
                min={0}
                step="0.01"
                value={perKm}
                onChange={(e) => setPerKm(e.target.value)}
                className="mt-1 block w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Free radius (km)
              <input
                type="number"
                min={0}
                step="0.1"
                value={freeKm}
                onChange={(e) => setFreeKm(e.target.value)}
                className="mt-1 block w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Long trip after (km)
              <input
                type="number"
                min={0}
                step="0.1"
                value={longTripKm}
                onChange={(e) => setLongTripKm(e.target.value)}
                className="mt-1 block w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Long trip bonus (₹)
              <input
                type="number"
                min={0}
                step="0.01"
                value={longTripBonus}
                onChange={(e) => setLongTripBonus(e.target.value)}
                className="mt-1 block w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Rush surge (%)
              <input
                type="number"
                min={0}
                step="0.01"
                value={surgePercent}
                onChange={(e) => setSurgePercent(e.target.value)}
                className="mt-1 block w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Incentive target (orders/day)
              <input
                type="number"
                min={0}
                step="1"
                value={incentiveTarget}
                onChange={(e) => setIncentiveTarget(e.target.value)}
                className="mt-1 block w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Weekday incentive (₹)
              <input
                type="number"
                min={0}
                step="0.01"
                value={incentiveWeekday}
                onChange={(e) => setIncentiveWeekday(e.target.value)}
                className="mt-1 block w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Weekend incentive (₹)
              <input
                type="number"
                min={0}
                step="0.01"
                value={incentiveWeekend}
                onChange={(e) => setIncentiveWeekend(e.target.value)}
                className="mt-1 block w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {savingSettings ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save rates
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['pending', `Pending (${counts.pending})`],
            ['approved', `Approved (${counts.approved})`],
            ['all', `All riders (${counts.total})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === value
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filteredRiders.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow">
          <Bike className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="font-medium text-gray-600">
            {filter === 'pending'
              ? 'No rider applications waiting for approval'
              : filter === 'approved'
              ? 'No approved riders yet'
              : 'No riders registered yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRiders.map((rider) => {
            const badge = statusBadge(rider);
            const approval = approvalOf(rider);
            const isUpdating = updatingId === rider.id;
            const missingDocs = rider.missing_documents || [];
            const documentsVerified = !!rider.documents_verified;
            const canApprove = documentsVerified && missingDocs.length === 0;
            return (
              <div
                key={rider.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-gray-900">
                        {rider.name}
                      </p>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                      <span className="inline-flex items-center">
                        <Mail className="mr-1 h-3.5 w-3.5 text-gray-400" />
                        {rider.login_name}
                      </span>
                      {rider.phone && (
                        <a
                          href={`tel:${rider.phone}`}
                          className="inline-flex items-center text-emerald-700 hover:underline"
                        >
                          <Phone className="mr-1 h-3.5 w-3.5" />
                          {rider.phone}
                        </a>
                      )}
                      {rider.vehicle_number && (
                        <span className="inline-flex items-center">
                          <Bike className="mr-1 h-3.5 w-3.5 text-gray-400" />
                          {rider.vehicle_number}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      Registered {new Date(rider.created_at).toLocaleString('en-IN')}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs">
                      <span className="inline-flex items-center font-medium text-emerald-800">
                        <Wallet className="mr-1 h-3.5 w-3.5" />
                        Pending ₹
                        {Number(rider.pending_payout || 0).toFixed(2)}
                      </span>
                      <span className="text-emerald-700">
                        Paid ₹{Number(rider.paid_payout || 0).toFixed(2)} ·{' '}
                        {rider.delivery_count || 0} deliveries
                      </span>
                      {Number(rider.pending_payout || 0) > 0 && (
                        <button
                          onClick={() => markRiderPaid(rider)}
                          disabled={markingPaidId === rider.id}
                          className="ml-auto inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {markingPaidId === rider.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3 w-3" />
                          )}
                          Mark paid
                        </button>
                      )}
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {DOCUMENT_ROWS.map((row) => {
                        const value = rider[row.numberKey];
                        const documentUrl = rider.documents?.[row.key];
                        return (
                          <div
                            key={row.key}
                            className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2"
                          >
                            <p className="text-xs font-medium text-gray-500">
                              {row.label}
                            </p>
                            <p className="mt-0.5 break-all font-mono text-xs text-gray-900">
                              {value || (
                                <span className="text-red-600">
                                  Not provided
                                </span>
                              )}
                            </p>
                            {documentUrl ? (
                              <a
                                href={documentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center text-xs font-medium text-blue-600 hover:underline"
                              >
                                <FileText className="mr-1 h-3 w-3" />
                                View document
                                <ExternalLink className="ml-1 h-3 w-3" />
                              </a>
                            ) : (
                              <p className="mt-1 text-xs text-red-600">
                                No document uploaded
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {documentsVerified ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          Documents verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                          <Clock className="mr-1 h-3 w-3" />
                          Documents not verified
                        </span>
                      )}
                      {rider.documents_verified_at && (
                        <span className="text-gray-500">
                          Verified{' '}
                          {new Date(
                            rider.documents_verified_at
                          ).toLocaleString('en-IN')}
                          {rider.documents_verified_by
                            ? ` by ${rider.documents_verified_by}`
                            : ''}
                        </span>
                      )}
                      {missingDocs.length > 0 && (
                        <span className="text-red-600">
                          Missing: {missingDocs.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!documentsVerified && missingDocs.length === 0 && (
                      <button
                        onClick={() => updateRider(rider, 'verify')}
                        disabled={isUpdating}
                        className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <ShieldCheck className="mr-1.5 h-4 w-4" />
                        Verify documents
                      </button>
                    )}
                    {documentsVerified && (
                      <button
                        onClick={() => updateRider(rider, 'unverify')}
                        disabled={isUpdating}
                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        Unverify
                      </button>
                    )}
                    {approval === 'pending' && (
                      <>
                        <button
                          onClick={() => updateRider(rider, 'approve')}
                          disabled={isUpdating || !canApprove}
                          title={
                            canApprove
                              ? undefined
                              : 'Verify all four documents before approving'
                          }
                          className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="mr-1.5 h-4 w-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => updateRider(rider, 'reject')}
                          disabled={isUpdating}
                          className="inline-flex items-center rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <X className="mr-1.5 h-4 w-4" />
                          Reject
                        </button>
                      </>
                    )}

                    {approval === 'rejected' && (
                      <button
                        onClick={() => updateRider(rider, 'approve')}
                        disabled={isUpdating || !canApprove}
                        title={
                          canApprove
                            ? undefined
                            : 'Verify all four documents before approving'
                        }
                        className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Check className="mr-1.5 h-4 w-4" />
                        Approve
                      </button>
                    )}

                    {approval === 'approved' && rider.active && (
                      <button
                        onClick={() => updateRider(rider, 'deactivate')}
                        disabled={isUpdating}
                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <UserX className="mr-1.5 h-4 w-4" />
                        Deactivate
                      </button>
                    )}

                    {approval === 'approved' && !rider.active && (
                      <button
                        onClick={() => updateRider(rider, 'activate')}
                        disabled={isUpdating}
                        className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <CheckCircle className="mr-1.5 h-4 w-4" />
                        Activate
                      </button>
                    )}

                    {isUpdating && (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    )}

                    {!canApprove && approval !== 'approved' && (
                      <p className="w-full text-right text-xs text-amber-700">
                        {missingDocs.length > 0
                          ? 'Rider has not uploaded all four documents.'
                          : 'Verify all four documents before approving.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Riders register themselves at <strong>/rider/register</strong> and
          submit Aadhaar, PAN, driving license, and police verification
          documents. Review the uploaded documents and mark them verified before
          approving. After approval they log in with the same email/password and
          toggle themselves online from Rider Mode. Only online riders appear in
          the Delivery Assignment tab.
        </p>
      </div>
    </div>
  );
}
