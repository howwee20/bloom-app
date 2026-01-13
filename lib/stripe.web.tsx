// lib/stripe.web.tsx
// Web stub for Stripe - native SDK doesn't work on web
// In future, this could use @stripe/stripe-js for web payments

import React, { createContext, useContext } from 'react';

export interface SavedCard {
  last4: string;
  brand: string;
  paymentMethodId: string;
}

interface StripeContextType {
  hasSavedCard: boolean;
  savedCard: SavedCard | null;
  loading: boolean;
  initializeSetupIntent: () => Promise<{ clientSecret: string } | null>;
  confirmSetup: (clientSecret: string) => Promise<boolean>;
  chargeCard: (orderIntentId: string) => Promise<{ success: boolean; error?: string; requiresAction?: boolean; clientSecret?: string }>;
  clearSavedCard: () => Promise<void>;
  refreshPaymentInfo: () => Promise<void>;
}

const StripeContext = createContext<StripeContextType | null>(null);

export function useStripePayment() {
  const context = useContext(StripeContext);
  if (!context) {
    throw new Error('useStripePayment must be used within StripePaymentProvider');
  }
  return context;
}

interface StripePaymentProviderProps {
  children: React.ReactNode;
  session: any;
}

// Web stub - payments not supported on web version
export function StripePaymentProvider({ children }: StripePaymentProviderProps) {
  const value: StripeContextType = {
    hasSavedCard: false,
    savedCard: null,
    loading: false,
    initializeSetupIntent: async () => null,
    confirmSetup: async () => false,
    chargeCard: async () => ({ success: false, error: 'Not supported on web' }),
    clearSavedCard: async () => {},
    refreshPaymentInfo: async () => {},
  };

  return (
    <StripeContext.Provider value={value}>
      {children}
    </StripeContext.Provider>
  );
}

// Stub CardField for web - renders nothing
export function CardField() {
  return null;
}
