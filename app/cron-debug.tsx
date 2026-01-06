import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { theme } from '../constants/Colors';

type CronStatus = {
  job_name: string;
  last_run_at: string | null;
  last_status: string | null;
  last_payload: any;
};

export default function CronDebugScreen() {
  const [rows, setRows] = useState<CronStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cron_status')
        .select('job_name, last_run_at, last_status, last_payload')
        .order('job_name', { ascending: true });

      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      console.error('Cron status fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const formatTime = (value: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Cron Debug</Text>
        <Pressable style={styles.refreshButton} onPress={fetchStatus}>
          <Text style={styles.refreshText}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {rows.length === 0 && !loading && (
          <Text style={styles.emptyText}>No cron status found.</Text>
        )}
        {rows.map((row) => (
          <View key={row.job_name} style={styles.card}>
            <Text style={styles.jobName}>{row.job_name}</Text>
            <Text style={styles.metaText}>Last run: {formatTime(row.last_run_at)}</Text>
            <Text style={styles.metaText}>Status: {row.last_status || '—'}</Text>
            {row.last_payload && (
              <Text style={styles.payloadText} numberOfLines={6}>
                {JSON.stringify(row.last_payload)}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: theme.card,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  jobName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  metaText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  payloadText: {
    fontSize: 11,
    color: theme.textTertiary,
  },
  emptyText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
});
