// components/BloomCoin.tsx
// The Bloom Coin - One object. All value. Always growing.

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
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
  const shimmer = useRef(new Animated.Value(0)).current;
  const rimSize = COIN_SIZE * 0.06;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [shimmer]);

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

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-COIN_SIZE * 0.35, COIN_SIZE * 0.35],
  });
  const shimmerTranslateY = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [COIN_SIZE * 0.2, -COIN_SIZE * 0.2],
  });
  const shimmerRotate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ['-12deg', '12deg'],
  });
  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.35, 0.6, 0.35],
  });

  return (
    <Pressable onPress={onPress} style={styles.container}>
      {/* Coin shadow */}
      <View style={styles.shadow} />

      {/* The Coin */}
      <View style={styles.coinOuter}>
        <LinearGradient
          colors={['#F8E7B3', '#E3C86B', '#D8B14A', '#F3D996']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.coinRim, { padding: rimSize }]}
        >
          <View style={styles.coinFace}>
            <LinearGradient
              colors={['#F7EDBC', '#E3C874', '#D9B353', '#F5E1A2']}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={styles.faceGradient}
            />

            {/* Iridescent base */}
            <LinearGradient
              colors={[
                'rgba(255, 194, 212, 0.35)',
                'rgba(196, 235, 255, 0.35)',
                'rgba(190, 255, 221, 0.35)',
                'rgba(255, 241, 199, 0.35)',
                'rgba(210, 197, 255, 0.35)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iridescentBase}
            />

            {/* Animated iridescent sweep */}
            <Animated.View
              style={[
                styles.iridescentSweep,
                {
                  opacity: shimmerOpacity,
                  transform: [
                    { translateX: shimmerTranslate },
                    { translateY: shimmerTranslateY },
                    { rotate: shimmerRotate },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={[
                  'rgba(255, 255, 255, 0)',
                  'rgba(255, 220, 150, 0.45)',
                  'rgba(190, 255, 255, 0.55)',
                  'rgba(255, 210, 235, 0.5)',
                  'rgba(255, 255, 255, 0)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iridescentGradient}
              />
            </Animated.View>

            {/* Specular highlight */}
            <LinearGradient
              colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0)']}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.faceHighlight}
            />

            {/* Inner ring */}
            <View style={styles.innerRing} />

            {/* Value display */}
            <View style={styles.textContainer}>
              <Text style={styles.valueText}>{formatValue(totalValue)}</Text>
              <Text style={styles.changeText}>{formatChange(dailyChange)}</Text>
            </View>
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
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  coinRim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: COIN_SIZE / 2,
  },
  coinFace: {
    flex: 1,
    borderRadius: COIN_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  iridescentBase: {
    ...StyleSheet.absoluteFillObject,
  },
  iridescentSweep: {
    ...StyleSheet.absoluteFillObject,
  },
  iridescentGradient: {
    flex: 1,
  },
  faceHighlight: {
    position: 'absolute',
    top: '4%',
    left: '10%',
    width: '60%',
    height: '35%',
    borderRadius: COIN_SIZE * 0.3,
    opacity: 0.7,
  },
  innerRing: {
    position: 'absolute',
    width: COIN_SIZE * 0.82,
    height: COIN_SIZE * 0.82,
    borderRadius: (COIN_SIZE * 0.82) / 2,
    borderWidth: 2.5,
    borderColor: 'rgba(180, 140, 35, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 44,
    fontWeight: '700',
    color: '#5B4716',
    textShadowColor: 'rgba(255, 255, 255, 0.45)',
    textShadowOffset: { width: 0.5, height: 1 },
    textShadowRadius: 2,
  },
  changeText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#6C551C',
    marginTop: 4,
    textShadowColor: 'rgba(255, 255, 255, 0.4)',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
  },
});

export default BloomCoin;
