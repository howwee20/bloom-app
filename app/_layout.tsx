// File: app/_layout.tsx

import React, { useState, useEffect, createContext, useContext } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { ZenDots_400Regular } from '@expo-google-fonts/zen-dots';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// 1. Create a context for the session
const AuthContext = createContext<{ session: Session | null; loading: boolean }>({
  session: null,
  loading: true,
});

// Custom hook to read the session from the context
export function useAuth() {
  return useContext(AuthContext);
}

// Custom hook for protecting routes with smart username checking
function useProtectedRoute(session: Session | null) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const checkUserProfile = async (sessionUser: Session['user']) => {
      try {
        // 1. Check if the user has a username in their profile
        const { data, error } = await supabase
          .from('profile')
          .select('username')
          .eq('id', sessionUser.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          // 'PGRST116' means 'No rows found', which is fine.
          // Any other error, we should log it.
          throw error;
        }

        // 2. Decide where to navigate
        if (data && data.username) {
          // They have a username, send to main app
          router.replace('/(tabs)');
        } else {
          // They are logged in but have no username, force them to create one
          router.replace('/create-username');
        }
      } catch (e) {
        console.error('Error checking user profile:', e);
        // Fallback: just send to login
        router.replace('/login');
      }
    };

    if (session) {
      // Session exists, check their profile
      checkUserProfile(session.user);
    } else {
      // No session, send to login (unless already on auth screens)
      const onAuthScreen = segments.includes('login') || segments.includes('signup');
      if (!onAuthScreen) {
        router.replace('/login');
      }
    }
  }, [session, router]);
}

// 2. Create the AuthProvider component
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    // Fetch the initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Use the protected route logic
  useProtectedRoute(session);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// 3. The main RootLayout
export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ZenDots: ZenDots_400Regular,
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <Stack>
          {/* Main app tabs */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* Asset detail screen */}
          <Stack.Screen name="asset/[id]" options={{ headerShown: false }} />
          {/* Checkout flow */}
          <Stack.Screen name="checkout/confirm-order" options={{ headerShown: false }} />
          {/* Redemption flow */}
          <Stack.Screen name="redeem/[tokenId]" options={{ headerShown: false }} />
          {/* Token detail screen */}
          <Stack.Screen name="token/[id]" options={{ headerShown: false }} />
          {/* Orders screens */}
          <Stack.Screen name="orders" options={{ headerShown: false }} />
          <Stack.Screen name="orders/[id]" options={{ headerShown: false }} />
          {/* Post-payment success */}
          <Stack.Screen name="checkout/success" options={{ headerShown: false }} />
          {/* Profile */}
          <Stack.Screen name="profile" options={{ headerShown: false }} />
          {/* Add item */}
          <Stack.Screen name="add-item" options={{ headerShown: false }} />
          {/* Buy flow */}
          <Stack.Screen name="buy" options={{ headerShown: false }} />
          {/* Authentication flow */}
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="please-confirm-email" options={{ headerShown: false }} />
          <Stack.Screen name="create-username" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
