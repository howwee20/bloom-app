// app/profile.tsx
import React from 'react';
import { StyleSheet, Text, View, Pressable, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from './_layout';
import { theme, fonts } from '../constants/Colors';

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* User Email */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>EMAIL</Text>
          <Text style={styles.emailText}>{session?.user?.email || 'Not signed in'}</Text>
        </View>

        {/* My Orders */}
        <Pressable style={styles.menuItem} onPress={() => router.push('/orders')}>
          <Text style={styles.menuItemText}>My Orders</Text>
          <Text style={styles.menuItemArrow}>→</Text>
        </Pressable>

        {__DEV__ && (
          <Pressable style={styles.menuItem} onPress={() => router.push('/cron-debug')}>
            <Text style={styles.menuItemText}>Cron Debug</Text>
            <Text style={styles.menuItemArrow}>→</Text>
          </Pressable>
        )}

        {/* Logout */}
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 24,
    color: theme.accent,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingTop: 32,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emailText: {
    fontSize: 17,
    color: theme.textPrimary,
  },
  logoutButton: {
    marginHorizontal: 16,
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.error,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 17,
    fontWeight: '500',
    color: theme.textPrimary,
  },
  menuItemArrow: {
    fontSize: 17,
    color: theme.textSecondary,
  },
});
