import React, { useMemo } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, theme } from '../constants/Colors';

export interface PricePoint {
  price: number;
  recorded_at: string;
}

export interface RangeOption {
  label: string;
  days: number | 'all';
}

interface PriceChartProps {
  data: PricePoint[];
  ranges: RangeOption[];
  selectedRange: RangeOption;
  onRangeChange: (range: RangeOption) => void;
  height?: number;
}

export default function PriceChart({
  data,
  ranges,
  selectedRange,
  onRangeChange,
  height = 140,
}: PriceChartProps) {
  const chartWidth = Dimensions.get('window').width - 32;
  const chartHeight = height;

  const trend = useMemo(() => {
    if (data.length < 2) return { color: theme.textSecondary, isUp: true };
    const first = data[0]?.price ?? 0;
    const last = data[data.length - 1]?.price ?? 0;
    const isUp = last >= first;
    return { color: isUp ? theme.success : theme.error, isUp };
  }, [data]);

  const points = useMemo(() => {
    if (data.length < 2) return [];
    const prices = data.map((point) => point.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    return prices.map((price, index) => ({
      x: (index / (prices.length - 1)) * chartWidth,
      y: chartHeight - ((price - min) / range) * chartHeight,
    }));
  }, [data, chartWidth, chartHeight]);

  return (
    <View style={styles.container}>
      <View style={styles.rangeRow}>
        {ranges.map((range) => {
          const isActive = range.label === selectedRange.label;
          return (
            <Pressable
              key={range.label}
              style={[styles.rangeChip, isActive && styles.rangeChipActive]}
              onPress={() => onRangeChange(range)}
            >
              <Text style={[styles.rangeText, isActive && styles.rangeTextActive]}>
                {range.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {data.length < 2 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No history yet — collecting price data</Text>
        </View>
      ) : (
        <View style={[styles.chart, { width: chartWidth, height: chartHeight }]}>
          {points.slice(0, -1).map((point, index) => {
            const nextPoint = points[index + 1];
            const dx = nextPoint.x - point.x;
            const dy = nextPoint.y - point.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            return (
              <View
                key={`${point.x}-${index}`}
                style={[
                  styles.chartLine,
                  {
                    width: length,
                    backgroundColor: trend.color,
                    left: point.x,
                    top: point.y,
                    transform: [{ rotate: `${angle}deg` }],
                    transformOrigin: 'left center',
                  },
                ]}
              />
            );
          })}
          <View
            style={[
              styles.chartDot,
              {
                backgroundColor: trend.color,
                left: points[points.length - 1].x - 4,
                top: points[points.length - 1].y - 4,
              },
            ]}
          />
          <View style={styles.chartLabels}>
            <Text style={styles.chartLabel}>{selectedRange.label}</Text>
            <Text style={styles.chartLabel}>Now</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rangeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rangeChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  rangeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  rangeTextActive: {
    color: theme.textInverse,
  },
  chart: {
    alignSelf: 'center',
  },
  chartLine: {
    position: 'absolute',
    height: 2,
    borderRadius: 2,
  },
  chartDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  chartLabels: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartLabel: {
    fontSize: 11,
    color: theme.textTertiary,
    fontFamily: fonts.body,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 13,
    color: theme.textSecondary,
  },
});
