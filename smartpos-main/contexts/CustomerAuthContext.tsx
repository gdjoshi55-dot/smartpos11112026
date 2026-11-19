'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export interface CustomerAccount {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
}

interface ProfileInput {
  name?: string;
  phone?: string | null;
  address?: string | null;
}

interface CustomerAuthContextValue {
  customer: CustomerAccount | null;
  loyaltyPoints: number;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: ProfileInput) => Promise<void>;
  refresh: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(
  null
);

async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function CustomerAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/auth/me', {
        cache: 'no-store',
      });
      const data = await readJson(res);
      if (res.ok && data?.customer) {
        setCustomer(data.customer);
        setLoyaltyPoints(Number(data.loyalty_points || 0));
      } else {
        setCustomer(null);
        setLoyaltyPoints(0);
      }
    } catch {
      setCustomer(null);
      setLoyaltyPoints(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/customer/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await readJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Could not sign in');
    }
    setCustomer(data.customer);
    setLoyaltyPoints(0);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const res = await fetch('/api/customer/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await readJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Could not create your account');
    }
    setCustomer(data.customer);
    setLoyaltyPoints(0);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/customer/auth/logout', { method: 'POST' });
    } finally {
      setCustomer(null);
      setLoyaltyPoints(0);
    }
  }, []);

  const updateProfile = useCallback(async (input: ProfileInput) => {
    const res = await fetch('/api/customer/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await readJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Could not update your profile');
    }
    setCustomer(data.customer);
  }, []);

  const value = useMemo<CustomerAuthContextValue>(
    () => ({
      customer,
      loyaltyPoints,
      loading,
      login,
      register,
      logout,
      updateProfile,
      refresh,
    }),
    [customer, loyaltyPoints, loading, login, register, logout, updateProfile, refresh]
  );

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) {
    throw new Error(
      'useCustomerAuth must be used within a CustomerAuthProvider'
    );
  }
  return ctx;
}
