import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../constants/Colors';

interface PositionCardProps {
  marketValue: number | null;
  costBasis: number | null;
  pnlDollars: number | null;
  pnlPercent: number | null;
  dayChangeDollars: number | null;
  dayChangePercent: number | null;
  formatPrice: (value: number | null | undefined) => string;
  onEditCostBasis: () => void;
}

export default function PositionCard({
  marketValue,
  costBasis,
  pnlDollars,
  pnlPercent,
  dayChangeDollars,
  dayChangePercent,
  formatPrice,
  onEditCostBasis,
}: PositionCardProps) {
  const pnlColor =
    pnlDollars === null ? theme.textSecondary : pnlDollars >= 0 ? theme.success : theme.error;
  const dayColor =
    dayChangeDollars === null
      ? theme.textSecondary
      : dayChangeDollars >= 0
        ? theme.success
        : theme.error;

  const formatDelta = (value: number | null) => {
    if (value === null) return '--';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${formatPrice(value)}`;
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return '--';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={styles.label}>Market Value</Text>
          <Text style={styles.value}>{formatPrice(marketValue)}</Text>
        </View>
        <View style={styles.cell}>
          <View style={styles.rowInline}>
            <Text style={styles.label}>Cost Basis</Text>
            <Pressable onPress={onEditCostBasis}>
              <Text style={styles.editLink}>{costBasis ? 'Edit' : 'Add'}</Text>
            </Pressable>
          </View>
          <Text style={styles.value}>
            {costBasis && costBasis > 0 ? formatPrice(costBasis) : '—'}
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={styles.label}>Unrealized P/L</Text>
          <Text style={[styles.value, { color: pnlColor }]}>
            {pnlDollars !== null ? `${formatDelta(pnlDollars)} (${formatPercent(pnlPercent)})` : '—'}
          </Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.label}>Day Change</Text>
          <Text style={[styles.value, { color: dayColor }]}>
            {dayChangeDollars !== null
              ? `${formatDelta(dayChangeDollars)} (${formatPercent(dayChangePercent)})`
              : '—'}
          </Text>
        </View>
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
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  cell: {
    flex: 1,
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: theme.border,
  },
  label: {
    fontSize: 11,
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  editLink: {
    fontSize: 12,
    color: theme.accent,
    fontWeight: '600',
  },
  rowInline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
