// File: app/_layout.tsx

import React, { useState, useEffect, createContext, useContext } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
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

// Custom hook for protecting routes
function useProtectedRoute(session: Session | null) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)'; // Assuming you might group auth routes later
    const inAppGroup = segments[0] === '(tabs)';

    if (!session && inAppGroup) {
      // Redirect to the login page if the user is not signed in
      // and is trying to access a protected route.
      router.replace('/login');
    } else if (session && (segments.includes('login') || segments.includes('signup'))) {
      // Redirect away from the sign-in page if the user is signed in.
      router.replace('/');
    }
  }, [session, segments]);
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
    <AuthProvider>
      <Stack>
        {/* The main app flow, protected */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Additional screens */}
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        {/* Winner flow */}
        <Stack.Screen name="winner-payout" options={{ headerShown: false }} />
        <Stack.Screen name="winner-lockout" options={{ headerShown: false }} />
        {/* The authentication flow */}
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
