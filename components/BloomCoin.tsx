// components/BloomCoin.tsx
// The Bloom Coin - One object. All value. Always growing.

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../constants/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COIN_SIZE = SCREEN_WIDTH * 0.7;

interface BloomCoinProps {
  totalValue: number;
  dailyChange: number;
  onPress: () => void;
}

export function BloomCoin({ totalValue, dailyChange, onPress }: BloomCoinProps) {
  const formatValue = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatChange = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)} today`;
  };

  return (
    <Pressable onPress={onPress} style={styles.container}>
      {/* Coin shadow */}
      <View style={styles.shadow} />

      {/* The Coin */}
      <View style={styles.coinOuter}>
        <LinearGradient
          colors={['#F5E6A3', '#D4AF37', '#F5E6A3', '#C5A028', '#F5E6A3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.coinGradient}
        >
          {/* Holographic overlay effect */}
          <LinearGradient
            colors={[
              'rgba(255, 182, 193, 0.3)',
              'rgba(173, 216, 230, 0.3)',
              'rgba(144, 238, 144, 0.3)',
              'rgba(255, 218, 185, 0.3)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.holographicOverlay}
          />

          {/* Inner ring */}
          <View style={styles.innerRing}>
            {/* Value display */}
            <Text style={styles.valueText}>{formatValue(totalValue)}</Text>
            <Text style={styles.changeText}>{formatChange(dailyChange)}</Text>
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    position: 'absolute',
    bottom: -20,
    width: COIN_SIZE * 0.8,
    height: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: COIN_SIZE * 0.4,
    transform: [{ scaleY: 0.3 }],
  },
  coinOuter: {
    width: COIN_SIZE,
    height: COIN_SIZE,
    borderRadius: COIN_SIZE / 2,
    overflow: 'hidden',
    // Coin edge effect
    borderWidth: 4,
    borderColor: '#C5A028',
  },
  coinGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holographicOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  innerRing: {
    width: COIN_SIZE * 0.85,
    height: COIN_SIZE * 0.85,
    borderRadius: (COIN_SIZE * 0.85) / 2,
    borderWidth: 2,
    borderColor: 'rgba(197, 160, 40, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 42,
    fontWeight: '700',
    color: '#5C4A1F',
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  changeText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#5C4A1F',
    marginTop: 4,
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
  },
});

export default BloomCoin;
