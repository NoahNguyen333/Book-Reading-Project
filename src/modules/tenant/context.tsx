'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { TenantContextValue, UserTenantMembership } from './types';
import { ACTIVE_TENANT_COOKIE, resolveActiveMembership } from './helpers';

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

interface TenantProviderProps {
  children: React.ReactNode;
  initialMemberships?: UserTenantMembership[];
  initialActiveTenantId?: string | null;
}

export function TenantProvider({
  children,
  initialMemberships = [],
  initialActiveTenantId = null,
}: TenantProviderProps) {
  const [memberships] = useState<UserTenantMembership[]>(initialMemberships);
  const [activeMembership, setActiveMembership] = useState<UserTenantMembership | null>(() => {
    return resolveActiveMembership(initialMemberships, initialActiveTenantId);
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const setActiveTenantId = useCallback(
    (tenantId: string) => {
      setIsLoading(true);
      const matched = memberships.find((m) => m.tenant.id === tenantId);
      if (matched) {
        setActiveMembership(matched);
        // Persist selection into cookie for SSR hydration
        if (typeof document !== 'undefined') {
          document.cookie = `${ACTIVE_TENANT_COOKIE}=${encodeURIComponent(
            tenantId
          )}; path=/; max-age=31536000; SameSite=Lax`;
        }
      }
      setIsLoading(false);
    },
    [memberships]
  );

  useEffect(() => {
    if (!activeMembership && memberships.length > 0) {
      const defaultMembership = resolveActiveMembership(memberships, initialActiveTenantId);
      if (defaultMembership) {
        setActiveMembership(defaultMembership);
        if (typeof document !== 'undefined') {
          document.cookie = `${ACTIVE_TENANT_COOKIE}=${encodeURIComponent(
            defaultMembership.tenant.id
          )}; path=/; max-age=31536000; SameSite=Lax`;
        }
      }
    }
  }, [memberships, initialActiveTenantId, activeMembership]);

  const value: TenantContextValue = {
    activeTenant: activeMembership?.tenant ?? null,
    activeRole: activeMembership?.role ?? null,
    memberships,
    setActiveTenantId,
    isLoading,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
