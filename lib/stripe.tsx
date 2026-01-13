// lib/stripe.tsx
// Stripe SDK integration for React Native
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { StripeProvider as StripeSDKProvider, useStripe, CardField } from '@stripe/stripe-react-native';
import { supabase } from './supabase';

// Stripe publishable key from environment
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

export interface SavedCard {
  last4: string;
  brand: string;
  paymentMethodId: string;
}

interface StripeContextType {
  hasSavedCard: boolean;
  savedCard: SavedCard | null;
  loading: boolean;
  // Actions
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

interface StripePaymentProviderInnerProps {
  children: React.ReactNode;
  session: any;
}

function StripePaymentProviderInner({ children, session }: StripePaymentProviderInnerProps) {
  const { confirmSetupIntent, handleNextAction } = useStripe();
  const [hasSavedCard, setHasSavedCard] = useState(false);
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch saved payment info
  const refreshPaymentInfo = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_stripe_payment_info');

      if (error) {
        console.error('Error fetching payment info:', error);
        return;
      }

      if (data && data.length > 0) {
        const info = data[0];
        setHasSavedCard(info.has_saved_card);
        if (info.has_saved_card && info.card_last4) {
          setSavedCard({
            last4: info.card_last4,
            brand: info.card_brand || 'card',
            paymentMethodId: '', // Don't expose PM ID to client
          });
        } else {
          setSavedCard(null);
        }
      }
    } catch (e) {
      console.error('Payment info fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    refreshPaymentInfo();
  }, [refreshPaymentInfo]);

  // Initialize SetupIntent for saving a new card
  const initializeSetupIntent = useCallback(async () => {
    if (!session) return null;

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-setup-intent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create setup intent');
      }

      return {
        clientSecret: result.client_secret,
        setupIntentId: result.setup_intent_id,
      };
    } catch (e: any) {
      console.error('SetupIntent error:', e);
      Alert.alert('Error', e.message || 'Failed to initialize card setup');
      return null;
    }
  }, [session]);

  // Confirm SetupIntent after card entry
  const confirmSetup = useCallback(async (clientSecret: string) => {
    try {
      const { setupIntent, error } = await confirmSetupIntent(clientSecret, {
        paymentMethodType: 'Card',
      });

      if (error) {
        console.error('ConfirmSetupIntent error:', error);
        Alert.alert('Error', error.message || 'Failed to save card');
        return false;
      }

      if (setupIntent?.status === 'Succeeded') {
        // Notify backend to save the card
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/confirm-setup-intent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              setup_intent_id: setupIntent.id,
              payment_method_id: setupIntent.paymentMethodId,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to save card');
        }

        // Refresh payment info
        await refreshPaymentInfo();
        return true;
      }

      return false;
    } catch (e: any) {
      console.error('ConfirmSetup error:', e);
      Alert.alert('Error', e.message || 'Failed to save card');
      return false;
    }
  }, [session, confirmSetupIntent, refreshPaymentInfo]);

  // Charge saved card
  const chargeCard = useCallback(async (orderIntentId: string) => {
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-payment-intent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            order_intent_id: orderIntentId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || 'Payment failed' };
      }

      if (result.status === 'succeeded') {
        return { success: true };
      }

      if (result.requires_action && result.client_secret) {
        // Handle 3DS authentication
        const { error: handleActionError } = await handleNextAction(result.client_secret);

        if (handleActionError) {
          return { success: false, error: handleActionError.message };
        }

        return { success: true };
      }

      if (result.status === 'failed') {
        return { success: false, error: result.error || 'Payment declined' };
      }

      return { success: false, error: 'Unknown payment status' };
    } catch (e: any) {
      console.error('ChargeCard error:', e);
      return { success: false, error: e.message || 'Payment failed' };
    }
  }, [session, handleNextAction]);

  // Clear saved card
  const clearSavedCard = useCallback(async () => {
    if (!session) return;

    try {
      await supabase.rpc('clear_saved_payment_method');
      setHasSavedCard(false);
      setSavedCard(null);
    } catch (e) {
      console.error('Clear card error:', e);
    }
  }, [session]);

  const value: StripeContextType = {
    hasSavedCard,
    savedCard,
    loading,
    initializeSetupIntent,
    confirmSetup,
    chargeCard,
    clearSavedCard,
    refreshPaymentInfo,
  };

  return (
    <StripeContext.Provider value={value}>
      {children}
    </StripeContext.Provider>
  );
}

interface StripePaymentProviderProps {
  children: React.ReactNode;
  session: any;
}

export function StripePaymentProvider({ children, session }: StripePaymentProviderProps) {
  // On web, Stripe SDK doesn't work - we'd use Stripe.js instead
  // For now, provide a minimal context on web
  if (Platform.OS === 'web') {
    return (
      <StripeContext.Provider value={{
        hasSavedCard: false,
        savedCard: null,
        loading: false,
        initializeSetupIntent: async () => null,
        confirmSetup: async () => false,
        chargeCard: async () => ({ success: false, error: 'Not supported on web' }),
        clearSavedCard: async () => {},
        refreshPaymentInfo: async () => {},
      }}>
        {children}
      </StripeContext.Provider>
    );
  }

  if (!STRIPE_PUBLISHABLE_KEY) {
    console.warn('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY not set');
    return (
      <StripeContext.Provider value={{
        hasSavedCard: false,
        savedCard: null,
        loading: false,
        initializeSetupIntent: async () => null,
        confirmSetup: async () => false,
        chargeCard: async () => ({ success: false, error: 'Stripe not configured' }),
        clearSavedCard: async () => {},
        refreshPaymentInfo: async () => {},
      }}>
        {children}
      </StripeContext.Provider>
    );
  }

  return (
    <StripeSDKProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <StripePaymentProviderInner session={session}>
        {children}
      </StripePaymentProviderInner>
    </StripeSDKProvider>
  );
}

// Export CardField for use in add card flow
export { CardField } from '@stripe/stripe-react-native';
