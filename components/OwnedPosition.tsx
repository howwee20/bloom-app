import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../constants/Colors';

interface OwnedPositionProps {
  costBasis: number | null;
  pnlDollars: number | null;
  pnlPercent: number | null;
  formatPrice: (value: number | null | undefined) => string;
  onEditCostBasis: () => void;
  holdingDays?: number | null;
}

export default function OwnedPosition({
  costBasis,
  pnlDollars,
  pnlPercent,
  formatPrice,
  onEditCostBasis,
  holdingDays,
}: OwnedPositionProps) {
  const pnlColor =
    pnlDollars === null ? theme.textSecondary : pnlDollars >= 0 ? theme.success : theme.error;
  const pnlLabel =
    pnlDollars === null || pnlPercent === null
      ? '—'
      : `${pnlDollars >= 0 ? '+' : ''}${formatPrice(pnlDollars)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`;

  return (
    <View style={styles.card}>
      <View style={styles.cell}>
        <View style={styles.rowInline}>
          <Text style={styles.label}>Cost Basis</Text>
          <Pressable onPress={onEditCostBasis}>
            <Text style={styles.editLink}>{costBasis ? 'Edit' : 'Add'}</Text>
          </Pressable>
        </View>
        {costBasis && costBasis > 0 ? (
          <Text style={styles.value}>{formatPrice(costBasis)}</Text>
        ) : (
          <Text style={styles.valueAdd}>Add what you paid</Text>
        )}
      </View>
      <View style={[styles.cell, styles.cellRight]}>
        <Text style={styles.label}>Unrealized P/L</Text>
        <Text style={[styles.value, { color: pnlColor }]}>{pnlLabel}</Text>
        {holdingDays !== null && holdingDays !== undefined && (
          <Text style={styles.holdingText}>{holdingDays} days held</Text>
        )}
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
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    padding: 14,
    borderRightWidth: 1,
    borderRightColor: theme.border,
  },
  cellRight: {
    borderRightWidth: 0,
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
  valueAdd: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.accent,
  },
  holdingText: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 6,
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
