import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../constants/Colors';

export interface StatItem {
  label: string;
  value: string;
}

interface StatsRowProps {
  stats: StatItem[];
}

export default function StatsRow({ stats }: StatsRowProps) {
  return (
    <View style={styles.card}>
      <View style={styles.grid}>
        {stats.map((stat, index) => {
          const isRight = index % 2 === 1;
          const isBottom = index < stats.length - 2;
          return (
            <View
              key={`${stat.label}-${index}`}
              style={[
                styles.cell,
                isRight && styles.cellRight,
                isBottom && styles.cellBottom,
              ]}
            >
              <Text style={styles.label}>{stat.label}</Text>
              <Text style={styles.value}>{stat.value}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '50%',
    padding: 14,
    borderRightWidth: 1,
    borderRightColor: theme.border,
  },
  cellRight: {
    borderRightWidth: 0,
  },
  cellBottom: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  label: {
    fontSize: 11,
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
});
