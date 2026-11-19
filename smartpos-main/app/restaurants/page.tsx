'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Clock,
  KeyRound,
  Loader2,
  LocateFixed,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
} from 'lucide-react';
import CustomerNav from '@/components/customer/CustomerNav';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';

const LOCATION_KEY = 'smartpos_customer_location';
const RADIUS_KM = 10;

interface Restaurant {
  restaurant_id: string;
  restaurant_name: string;
  phone: string | null;
  address: string;
  currency: string | null;
  delivery_mode: string | null;
  accepting_orders: boolean;
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
}

interface CustomerLocation {
  lat: number;
  lng: number;
  label: string;
}

function coordsLabel(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export default function RestaurantsNearbyPage() {
  const router = useRouter();
  const { customer } = useCustomerAuth();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [location, setLocation] = useState<CustomerLocation | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(true);

  const fetchRestaurants = useCallback(
    async (loc: CustomerLocation | null, all: boolean) => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (!all && loc) {
          params.set('lat', String(loc.lat));
          params.set('lng', String(loc.lng));
          params.set('radiusKm', String(RADIUS_KM));
        }
        const query = params.toString();
        const res = await fetch(
          `/api/restaurants${query ? `?${query}` : ''}`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Could not load restaurants');
        }
        setRestaurants(Array.isArray(data.restaurants) ? data.restaurants : []);
        setSkipped(Number(data.skipped_no_location || 0));
      } catch (err: any) {
        setRestaurants([]);
        setSkipped(0);
        setError(err?.message || 'Could not load restaurants');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const applyLocation = useCallback(
    (loc: CustomerLocation) => {
      setLocation(loc);
      setAddressInput(loc.label);
      setShowAll(false);
      try {
        window.localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
      } catch {
        // Storage may be unavailable (private mode) - filtering still works.
      }
      void fetchRestaurants(loc, false);
    },
    [fetchRestaurants]
  );

  useEffect(() => {
    let stored: CustomerLocation | null = null;
    try {
      const raw = window.localStorage.getItem(LOCATION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const lat = Number(parsed?.lat);
        const lng = Number(parsed?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          stored = {
            lat,
            lng,
            label:
              typeof parsed?.label === 'string' && parsed.label
                ? parsed.label
                : coordsLabel(lat, lng),
          };
        }
      }
    } catch {
      stored = null;
    }

    if (stored) {
      setLocation(stored);
      setAddressInput(stored.label);
    }
    // Default to every restaurant; choosing a location switches to nearby-only.
    setShowAll(true);
    void fetchRestaurants(null, true);
  }, [fetchRestaurants]);

  useEffect(() => {
    setAddressInput((prev) => prev || customer?.address || '');
  }, [customer?.address]);

  const reverseLabel = async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch('/api/geo/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      const data = await res.json();
      if (res.ok && data?.label) return String(data.label);
    } catch {
      // Fall through to coordinates.
    }
    return coordsLabel(lat, lng);
  };

  const handleUseLocation = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Your browser does not support location. Search your area instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const label = await reverseLabel(lat, lng);
        setLocating(false);
        applyLocation({ lat, lng, label });
      },
      (geoError) => {
        setLocating(false);
        if (geoError.code === 1) {
          setError(
            'Location permission was denied. Allow access or type your area below.'
          );
        } else if (geoError.code === 3) {
          setError('Finding your location timed out. Try searching your area.');
        } else {
          setError('Could not get your location. Try searching your area.');
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
    );
  };

  const handleSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const address = addressInput.trim();
    if (!address || searching) return;
    setSearching(true);
    setError('');
    try {
      const res = await fetch('/api/geo/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok || !Number.isFinite(Number(data?.lat))) {
        throw new Error(data?.error || 'Could not find that location');
      }
      applyLocation({
        lat: Number(data.lat),
        lng: Number(data.lng),
        label: data.label || address,
      });
    } catch (err: any) {
      setError(err?.message || 'Could not find that location');
    } finally {
      setSearching(false);
    }
  };

  const toggleShowAll = () => {
    const next = !showAll;
    setShowAll(next);
    void fetchRestaurants(location, next);
  };

  const handleCodeSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalized.length < 6) {
      setCodeError('Enter the restaurant code shown at the table or entrance.');
      return;
    }
    setCodeError('');
    router.push(`/order/${encodeURIComponent(normalized)}`);
  };

  return (
    <div className="min-h-screen bg-[#EBF3FE] flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <Link href="/restaurants" className="flex items-center gap-2">
            <div className="w-9 h-9 border-2 border-[#1E5FE8] rounded-xl flex items-center justify-center">
              <Store className="h-5 w-5 text-[#1E5FE8]" />
            </div>
            <div className="leading-tight">
              <span className="text-lg font-bold">
                <span className="text-[#0B1B3A]">Smart</span>
                <span className="text-[#1E5FE8]">POS</span>
              </span>
              <p className="text-[10px] text-gray-400 -mt-0.5">
                Order from restaurants near you
              </p>
            </div>
          </Link>
          <CustomerNav />
        </div>
      </header>

      <main className="w-full max-w-5xl mx-auto px-4 lg:px-6 py-8 flex-1">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 shrink-0 rounded-full bg-[#EBF3FE] flex items-center justify-center">
              <MapPin className="h-5 w-5 text-[#1E5FE8]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#0B1B3A]">
                Restaurants near you
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Set your location to see restaurants within {RADIUS_KM} km.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSearch}
            className="mt-5 flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Enter your area, street or pincode"
                className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
              />
            </div>
            <button
              type="submit"
              disabled={!addressInput.trim() || searching}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1E5FE8] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </button>
            <button
              type="button"
              onClick={handleUseLocation}
              disabled={locating}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#1E5FE8] px-4 py-3 text-sm font-semibold text-[#1E5FE8] transition-colors hover:bg-[#EBF3FE] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              {locating ? 'Locating…' : 'Use my location'}
            </button>
          </form>

          {location && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-green-700">
                <MapPin className="h-3.5 w-3.5" />
                <span className="max-w-[260px] truncate">{location.label}</span>
              </span>
              <button
                type="button"
                onClick={toggleShowAll}
                className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <RefreshCw className="h-3 w-3" />
                {showAll ? 'Show nearby only' : 'Show all restaurants'}
              </button>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <div
          id="restaurant-code"
          className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6"
        >
          <form
            onSubmit={handleCodeSubmit}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0B1B3A] sm:w-52 sm:shrink-0">
              <KeyRound className="h-4 w-4 text-[#1E5FE8]" />
              Have a restaurant code?
            </div>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                if (codeError) setCodeError('');
              }}
              placeholder="e.g. RESTABCD12"
              maxLength={20}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-bold uppercase tracking-widest text-[#0B1B3A] outline-none focus:border-transparent focus:ring-2 focus:ring-[#1E5FE8]"
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1E5FE8] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Find
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          {codeError && <p className="mt-2 text-sm text-red-600">{codeError}</p>}
        </div>

        <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-600">
            {loading
              ? 'Finding restaurants…'
              : `${restaurants.length} restaurant${
                  restaurants.length === 1 ? '' : 's'
                } ${
                  location && !showAll
                    ? `within ${RADIUS_KM} km`
                    : 'available'
                }`}
          </p>
          {!loading && skipped > 0 && location && !showAll && (
            <button
              type="button"
              onClick={toggleShowAll}
              className="text-xs font-medium text-[#1E5FE8] hover:underline"
            >
              {skipped} restaurant{skipped === 1 ? '' : 's'} not shown (location
              not set)
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl border border-gray-100 bg-white"
              />
            ))}
          </div>
        ) : restaurants.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#EBF3FE]">
              <Store className="h-7 w-7 text-[#1E5FE8]" />
            </div>
            <h2 className="text-lg font-bold text-[#0B1B3A]">
              {location && !showAll
                ? `No restaurants within ${RADIUS_KM} km`
                : 'No restaurants available yet'}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
              {location && !showAll
                ? 'Try a different location or browse every restaurant on SmartPOS.'
                : 'Restaurants will appear here once they are listed on SmartPOS.'}
            </p>
            <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
              {location && !showAll && (
                <button
                  type="button"
                  onClick={toggleShowAll}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1E5FE8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  Show all restaurants
                </button>
              )}
              <Link
                href="#restaurant-code"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Enter a restaurant code
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((restaurant) => (
              <div
                key={restaurant.restaurant_id}
                className="flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF3FE]">
                      <Store className="h-5 w-5 text-[#1E5FE8]" />
                    </div>
                    <h2 className="truncate font-bold text-[#0B1B3A]">
                      {restaurant.restaurant_name}
                    </h2>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      restaurant.accepting_orders
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {restaurant.accepting_orders ? 'Open' : 'Closed'}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-sm text-gray-500">
                  {restaurant.address && (
                    <p className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="line-clamp-2">{restaurant.address}</span>
                    </p>
                  )}
                  {restaurant.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span>{restaurant.phone}</span>
                    </p>
                  )}
                  {restaurant.distance_km !== null && (
                    <p className="flex items-center gap-1.5 font-medium text-[#1E5FE8]">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      ~{restaurant.distance_km.toFixed(1)} km away
                    </p>
                  )}
                </div>

                <Link
                  href={`/order/${encodeURIComponent(
                    restaurant.restaurant_id
                  )}`}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#1E5FE8] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  View menu &amp; order
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        )}

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
          Distances are approximate and measured as the crow flies.
        </p>
      </main>

      <footer className="mt-auto bg-[#0B1B3A] text-white">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 border-2 border-white rounded-lg flex items-center justify-center">
              <Store className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold">
              Smart<span className="text-[#6DA4FF]">POS</span>
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Powered by ALTTASOFTWARE CONSULTANCY LLP
          </p>
        </div>
      </footer>
    </div>
  );
}
