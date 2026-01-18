// components/CoinDisplay.tsx
// Holographic gold coin displaying portfolio value

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, fonts } from '../constants/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COIN_SIZE = Math.min(SCREEN_WIDTH * 0.7, 320);

interface CoinDisplayProps {
  totalValue: number;
  dailyChange: number | null;
  onPress: () => void;
}

export function CoinDisplay({ totalValue, dailyChange, onPress }: CoinDisplayProps) {
  const formatValue = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDailyChange = (change: number | null) => {
    if (change === null || change === 0) return null;
    const sign = change >= 0 ? '+' : '';
    return `${sign}$${Math.abs(change).toLocaleString()} today`;
  };

  const dailyChangeText = formatDailyChange(dailyChange);

  return (
    <Pressable onPress={onPress} style={styles.container}>
      {/* Outer gold ring */}
      <View style={styles.outerRing}>
        {/* Holographic gradient background */}
        <LinearGradient
          colors={[
            '#F5E6A3', // Light gold
            '#E8D48A', // Medium gold
            '#D4AF37', // Classic gold
            '#FFB347', // Orange gold
            '#E8D48A', // Medium gold
            '#C5E8B7', // Light green tint
            '#B8D4E8', // Light blue tint
            '#E8B8D4', // Light pink tint
            '#F5E6A3', // Back to light gold
          ]}
          locations={[0, 0.15, 0.3, 0.45, 0.55, 0.65, 0.75, 0.88, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.holographicGradient}
        >
          {/* Inner gold ring */}
          <View style={styles.innerRing}>
            {/* Center with value */}
            <LinearGradient
              colors={[
                '#F5E6A3',
                '#E8D48A',
                '#D4AF37',
                '#C9A227',
                '#D4AF37',
                '#E8D48A',
              ]}
              locations={[0, 0.2, 0.4, 0.6, 0.8, 1]}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={styles.coinCenter}
            >
              {/* Radial shine overlay */}
              <View style={styles.shineOverlay} />

              {/* Value text */}
              <Text style={styles.valueText}>{formatValue(totalValue)}</Text>

              {/* Daily change */}
              {dailyChangeText && (
                <Text style={styles.dailyChangeText}>{dailyChangeText}</Text>
              )}
            </LinearGradient>
          </View>
        </LinearGradient>
      </View>

      {/* Shadow underneath coin */}
      <View style={styles.coinShadow} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    width: COIN_SIZE,
    height: COIN_SIZE,
    borderRadius: COIN_SIZE / 2,
    padding: 8,
    backgroundColor: '#D4AF37',
    shadowColor: '#B8860B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  holographicGradient: {
    flex: 1,
    borderRadius: (COIN_SIZE - 16) / 2,
    padding: 12,
  },
  innerRing: {
    flex: 1,
    borderRadius: (COIN_SIZE - 40) / 2,
    backgroundColor: '#C9A227',
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  coinCenter: {
    flex: 1,
    borderRadius: (COIN_SIZE - 52) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  shineOverlay: {
    position: 'absolute',
    top: '10%',
    left: '20%',
    width: '30%',
    height: '20%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 100,
    transform: [{ rotate: '-30deg' }],
  },
  valueText: {
    fontFamily: fonts.heading,
    fontSize: 42,
    color: '#8B7355',
    letterSpacing: -1,
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  dailyChangeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B7355',
    marginTop: 4,
    textShadowColor: 'rgba(255, 255, 255, 0.4)',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
  },
  coinShadow: {
    position: 'absolute',
    bottom: -20,
    width: COIN_SIZE * 0.6,
    height: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 100,
    transform: [{ scaleX: 1.5 }],
    zIndex: -1,
  },
});

export default CoinDisplay;
