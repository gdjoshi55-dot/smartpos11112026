'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { Store, MapPin, Users, Lock, Percent, Phone, FileText, Save, CreditCard, Truck, Power, LocateFixed, QrCode, Download, Printer, Copy, ExternalLink } from 'lucide-react';

export default function RestaurantDashboard() {
  const { restaurant, updateRestaurant } = useAuth();

  const [name, setName] = useState(restaurant?.restaurant_name || '');
  const [gst, setGst] = useState(restaurant?.gst_number || '');
  const [phone, setPhone] = useState(restaurant?.phone || '');
  const [addr1, setAddr1] = useState(restaurant?.address_line1 || '');
  const [addr2, setAddr2] = useState(restaurant?.address_line2 || '');
  const [addr3, setAddr3] = useState(restaurant?.address_line3 || '');
  const [owner1, setOwner1] = useState(restaurant?.owner1 || '');
  const [owner2, setOwner2] = useState(restaurant?.owner2 || '');
  const [owner3, setOwner3] = useState(restaurant?.owner3 || '');
  const [owner4, setOwner4] = useState(restaurant?.owner4 || '');
  const [loginName, setLoginName] = useState(restaurant?.login_name || '');
  const [newPassword, setNewPassword] = useState('');
  const [mpin, setMpin] = useState(restaurant?.mpin || '1234');
  const [taxRate, setTaxRate] = useState(String(restaurant?.tax_rate || 18));
  const [rzpKeyId, setRzpKeyId] = useState(restaurant?.razorpay_key_id || '');
  const [rzpKeySecret, setRzpKeySecret] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'own' | 'aggregator' | 'both'>(
    (restaurant?.delivery_mode as 'own' | 'aggregator' | 'both') || 'aggregator'
  );
  const [latitude, setLatitude] = useState(
    restaurant?.latitude != null ? String(restaurant.latitude) : ''
  );
  const [longitude, setLongitude] = useState(
    restaurant?.longitude != null ? String(restaurant.longitude) : ''
  );
  const [acceptingOrders, setAcceptingOrders] = useState(
    restaurant?.accepting_orders !== false
  );
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  const orderUrl = publicBaseUrl && restaurant
    ? `${publicBaseUrl}/order/${encodeURIComponent(restaurant.restaurant_id)}?src=qr`
    : '';

  useEffect(() => {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
    setPublicBaseUrl(configured || window.location.origin);
  }, []);

  useEffect(() => {
    if (!orderUrl) return;
    let cancelled = false;
    QRCode.toDataURL(orderUrl, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1B3A', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not generate the QR code.');
      });
    return () => {
      cancelled = true;
    };
  }, [orderUrl]);

  if (!restaurant) return null;

  const captureRestaurantLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Location is not available on this device');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setLocating(false);
        toast.success('Restaurant location captured. Save to apply.');
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied.'
            : 'Could not get the current location.'
        );
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 20000 }
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: any = {
        restaurant_name: name,
        gst_number: gst || null,
        phone: phone || null,
        address_line1: addr1 || null,
        address_line2: addr2 || null,
        address_line3: addr3 || null,
        owner1: owner1 || null,
        owner2: owner2 || null,
        owner3: owner3 || null,
        owner4: owner4 || null,
        login_name: loginName.toLowerCase().trim() || null,
        mpin: mpin,
        tax_rate: parseFloat(taxRate) || 18,
        delivery_mode: deliveryMode,
        latitude: latitude.trim() ? parseFloat(latitude) : null,
        longitude: longitude.trim() ? parseFloat(longitude) : null,
        accepting_orders: acceptingOrders,
      };

      if (newPassword) {
        updates.password = newPassword;
      }

      if (rzpKeyId.trim() || rzpKeySecret.trim()) {
        if (!rzpKeyId.trim() || !rzpKeySecret.trim()) {
          toast.error('Enter both the Razorpay Key ID and Key Secret before saving.');
          return;
        }
        updates.razorpay_key_id = rzpKeyId.trim();
        updates.razorpay_key_secret = rzpKeySecret.trim();
      }

      const { error } = await supabase
        .from('parameters')
        .update(updates)
        .eq('restaurant_id', restaurant.restaurant_id);

      if (error) throw error;

      updateRestaurant({
        restaurant_name: name,
        gst_number: gst || null,
        phone: phone || null,
        address_line1: addr1 || null,
        address_line2: addr2 || null,
        address_line3: addr3 || null,
        owner1: owner1 || null,
        owner2: owner2 || null,
        owner3: owner3 || null,
        owner4: owner4 || null,
        login_name: loginName.toLowerCase().trim() || null,
        mpin: mpin,
        tax_rate: parseFloat(taxRate) || 18,
        delivery_mode: deliveryMode,
        latitude: latitude.trim() ? parseFloat(latitude) : null,
        longitude: longitude.trim() ? parseFloat(longitude) : null,
        accepting_orders: acceptingOrders,
      });

      if (rzpKeyId.trim() || rzpKeySecret.trim()) {
        updateRestaurant({
          razorpay_key_id: rzpKeyId.trim(),
          razorpay_key_secret: rzpKeySecret.trim(),
        });
      }

      setNewPassword('');
      toast.success('Settings saved successfully');
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${restaurant.restaurant_id}-order-qr.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleCopyLink = async () => {
    if (!orderUrl) return;
    try {
      await navigator.clipboard.writeText(orderUrl);
      toast.success('Ordering link copied');
    } catch {
      toast.error('Could not copy the ordering link');
    }
  };

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';
  const sectionClass = 'bg-white rounded-lg shadow-sm border border-gray-200 p-5';
  const sectionTitleClass =
    'text-sm font-semibold text-gray-900 mb-4 flex items-center pb-2 border-b border-gray-100';

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Restaurant ID: {restaurant.restaurant_id}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center font-medium text-sm"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Online Ordering */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>
          <Power className="h-4 w-4 mr-2 text-blue-600" />
          Online Ordering
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {acceptingOrders
                ? 'Open — accepting customer orders'
                : 'Closed — not accepting customer orders'}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              When closed, customers visiting your online menu see
              &quot;We are closed now&quot; and cannot place orders. POS orders
              still work.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={acceptingOrders}
            onClick={() => setAcceptingOrders((value) => !value)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              acceptingOrders
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                acceptingOrders ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  acceptingOrders ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </span>
            {acceptingOrders ? 'Open' : 'Closed'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Remember to click Save Changes to apply.
        </p>
      </div>

      {/* Self-Ordering QR */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>
          <QrCode className="h-4 w-4 mr-2 text-blue-600" />
          My Ordering QR
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Print this code and place it at the counter or on tables. Customers who
          scan it land directly on your menu in customer mode.
        </p>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white p-2">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={`Ordering QR for ${restaurant.restaurant_name}`}
                className="h-full w-full"
              />
            ) : (
              <span className="text-xs text-gray-400">Generating...</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500">Ordering link</p>
              <p
                className="truncate text-sm font-medium text-gray-900"
                title={orderUrl}
              >
                {orderUrl || 'Preparing...'}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Code: {restaurant.restaurant_id}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadQr}
                disabled={!qrDataUrl}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Download PNG
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!qrDataUrl}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Print poster
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!orderUrl}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                Copy link
              </button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-gray-400">
              <ExternalLink className="h-3 w-3" />
              {acceptingOrders
                ? 'Your menu is open for orders.'
                : 'Your menu is closed — enable Online Ordering and save before printing.'}
            </p>
          </div>
        </div>
        <div className="qr-print-only">
          <div style={{ textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
            <p style={{ fontSize: '14pt', letterSpacing: '2px', color: '#1E5FE8', margin: 0 }}>
              SCAN TO ORDER
            </p>
            <h1 style={{ fontSize: '26pt', margin: '10px 0', color: '#0B1B3A' }}>
              {restaurant.restaurant_name}
            </h1>
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="Scan to order"
                style={{ width: '90mm', height: '90mm', margin: '0 auto', display: 'block' }}
              />
            )}
            <p style={{ fontSize: '12pt', marginTop: '14px' }}>
              View the menu and place your order directly from your phone.
            </p>
            <p style={{ fontSize: '10pt', color: '#666', marginTop: '6px' }}>
              {restaurant.restaurant_id}
            </p>
          </div>
        </div>
      </div>

      {/* Restaurant Info */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>
          <Store className="h-4 w-4 mr-2 text-blue-600" />
          Restaurant Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Restaurant Name</label>
            <div className="relative">
              <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>GST Number</label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={gst}
                onChange={(e) => setGst(e.target.value)}
                placeholder="27AAAAA0000A1Z5"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Tax Rate (%)</label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Address */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>
          <MapPin className="h-4 w-4 mr-2 text-blue-600" />
          Address
        </h3>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Address Line 1</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={addr1}
                onChange={(e) => setAddr1(e.target.value)}
                placeholder="Shop / Building number, Street"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Address Line 2</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={addr2}
                onChange={(e) => setAddr2(e.target.value)}
                placeholder="Area / Locality"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Address Line 3</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={addr3}
                onChange={(e) => setAddr3(e.target.value)}
                placeholder="City, State, PIN"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Latitude</label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="e.g. 28.613900"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className={labelClass}>Longitude</label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="e.g. 77.209000"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={captureRestaurantLocation}
            disabled={locating}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
          >
            <LocateFixed className="h-4 w-4" />
            {locating ? 'Getting location...' : 'Use current location'}
          </button>
          <p className="text-xs text-gray-400">
            Used to calculate delivery distance from the restaurant to the
            customer. If left blank, the address above is geocoded automatically.
          </p>
        </div>
      </div>

      {/* Owner Info */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>
          <Users className="h-4 w-4 mr-2 text-blue-600" />
          Owner Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Owner 1</label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={owner1}
                onChange={(e) => setOwner1(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Owner 2</label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={owner2}
                onChange={(e) => setOwner2(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Owner 3</label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={owner3}
                onChange={(e) => setOwner3(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Owner 4</label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={owner4}
                onChange={(e) => setOwner4(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Login Credentials */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>
          <Lock className="h-4 w-4 mr-2 text-blue-600" />
          Login Credentials
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Login Email</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>New Password (leave blank to keep)</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      {/* MPIN */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>
          <Lock className="h-4 w-4 mr-2 text-blue-600" />
          MPIN (Restaurant Mode Access)
        </h3>
        <div className="max-w-xs">
          <label className={labelClass}>4-Digit MPIN</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={mpin}
              onChange={(e) => setMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="1234"
              className={inputClass}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            This MPIN is required when switching from Customer Mode to Restaurant Mode.
          </p>
        </div>
      </div>

      {/* Delivery */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>
          <Truck className="h-4 w-4 mr-2 text-blue-600" />
          Delivery
        </h3>
        <div className="max-w-sm">
          <label className={labelClass}>Delivery Mode</label>
          <select
            value={deliveryMode}
            onChange={(e) =>
              setDeliveryMode(e.target.value as 'own' | 'aggregator' | 'both')
            }
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
          >
            <option value="own">Own delivery riders</option>
            {/* Shadowfax disabled. Riders are assigned from the admin Delivery tab.
            <option value="aggregator">External partner (Shadowfax)</option>
            */}
            <option value="both">Both</option>
          </select>
          <p className="text-xs text-gray-400 mt-1.5">
            Choose who fulfils delivery orders. Add riders under Users with the
            &quot;Delivery Rider&quot; role, then assign them from Order Management.
          </p>
        </div>
      </div>

      {/* Razorpay Account */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>
          <CreditCard className="h-4 w-4 mr-2 text-blue-600" />
          Razorpay Account
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Online payments are made with your own Razorpay account, so money settles
          directly to your Razorpay account. Get the Key ID and Key Secret from your
          Razorpay dashboard (Settings &gt; API Keys).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Razorpay Key ID</label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={rzpKeyId}
                onChange={(e) => setRzpKeyId(e.target.value)}
                placeholder="e.g. rzp_live_XXXXXXXXXX"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>
              Razorpay Key Secret {restaurant?.razorpay_key_id && '(already configured)'}
            </label>
            <div className="relative">
              <input
                type="password"
                value={rzpKeySecret}
                onChange={(e) => setRzpKeySecret(e.target.value)}
                placeholder="Leave blank to keep current secret"
                className={inputClass}
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Enter both together to update. The customer is charged on the Razorpay page,
          and the amount settles to your own account.
        </p>
      </div>
    </div>
  );
}
