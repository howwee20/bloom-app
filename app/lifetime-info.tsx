// File: app/lifetime-info.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './_layout';
import { supabase } from '../lib/supabase';

// Tier configuration
const TIERS = [
  { min: 0, max: 29, name: 'Member', discount: 0 },
  { min: 30, max: 299, name: 'Silver', discount: 1 },
  { min: 300, max: Infinity, name: 'Gold', discount: 3 },
];

export const getDiscount = (lifetime: number): number => {
  if (lifetime >= 300) return 3;
  if (lifetime >= 30) return 1;
  return 0;
};

export const getTierName = (lifetime: number): string => {
  if (lifetime >= 300) return 'Gold';
  if (lifetime >= 30) return 'Silver';
  return 'Member';
};

export default function LifetimeInfoScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [lifetimeDays, setLifetimeDays] = useState(0);

  useEffect(() => {
    const fetchLifetime = async () => {
      if (!session) return;

      const { data } = await supabase
        .from('profile')
        .select('lifetime_days')
        .eq('id', session.user.id)
        .maybeSingle();

      if (data) {
        setLifetimeDays(data.lifetime_days || 0);
      }
    };

    fetchLifetime();
  }, [session]);

  const currentDiscount = getDiscount(lifetimeDays);
  const currentTier = getTierName(lifetimeDays);

  // Find next tier
  const currentTierIndex = TIERS.findIndex(t => lifetimeDays >= t.min && lifetimeDays <= t.max);
  const nextTier = currentTierIndex < TIERS.length - 1 ? TIERS[currentTierIndex + 1] : null;
  const daysToNextTier = nextTier ? nextTier.min - lifetimeDays : 0;

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        {/* Current Status */}
        <View style={styles.statusCard}>
          <Text style={styles.yourStatus}>Your Status</Text>
          <Text style={styles.tierName}>{currentTier}</Text>
          <Text style={styles.lifetimeCount}>{lifetimeDays} Lifetime Days</Text>
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>
              {currentDiscount > 0 ? `-${currentDiscount} days off everything` : 'Base pricing'}
            </Text>
          </View>
        </View>

        {/* Next Tier Progress */}
        {nextTier && (
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Next: {nextTier.name}</Text>
            <Text style={styles.progressText}>
              {daysToNextTier} more days to unlock -{nextTier.discount} days off
            </Text>
          </View>
        )}

        {/* All Tiers */}
        <View style={styles.tiersContainer}>
          <Text style={styles.tiersTitle}>All Tiers</Text>
          <Text style={styles.storeNote}>Discounts apply to entire store</Text>
          {TIERS.map((tier, index) => {
            const isCurrentTier = lifetimeDays >= tier.min && lifetimeDays <= tier.max;
            const isUnlocked = lifetimeDays >= tier.min;

            return (
              <View
                key={tier.name}
                style={[
                  styles.tierRow,
                  isCurrentTier && styles.tierRowCurrent,
                  !isUnlocked && styles.tierRowLocked
                ]}
              >
                <View style={styles.tierLeft}>
                  <Text style={[
                    styles.tierRowName,
                    isCurrentTier && styles.tierRowNameCurrent,
                    !isUnlocked && styles.tierRowNameLocked
                  ]}>
                    {tier.name}
                  </Text>
                  <Text style={[
                    styles.tierRowDays,
                    !isUnlocked && styles.tierRowDaysLocked
                  ]}>
                    {tier.max === Infinity ? `${tier.min}+` : `${tier.min}-${tier.max}`} days
                  </Text>
                </View>
                <Text style={[
                  styles.tierRowDiscount,
                  isCurrentTier && styles.tierRowDiscountCurrent,
                  !isUnlocked && styles.tierRowDiscountLocked
                ]}>
                  {tier.discount > 0 ? `-${tier.discount} days` : 'Base'}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Back Button */}
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFD7B5',
    paddingHorizontal: 30,
    paddingVertical: 60,
  },
  statusCard: {
    backgroundColor: '#FFF5EE',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  yourStatus: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 12,
    color: 'rgba(92, 64, 51, 0.6)',
    marginBottom: 8,
  },
  tierName: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 32,
    fontWeight: '700',
    color: '#5C4033',
    marginBottom: 4,
  },
  lifetimeCount: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: 'rgba(92, 64, 51, 0.7)',
    marginBottom: 16,
  },
  discountBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  discountText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  progressTitle: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 4,
  },
  progressText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 12,
    color: 'rgba(92, 64, 51, 0.7)',
  },
  tiersContainer: {
    marginBottom: 30,
  },
  tiersTitle: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    fontWeight: '600',
    color: '#5C4033',
    marginBottom: 4,
  },
  storeNote: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 10,
    color: 'rgba(92, 64, 51, 0.6)',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF5EE',
    borderRadius: 8,
    marginBottom: 8,
  },
  tierRowCurrent: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  tierRowLocked: {
    backgroundColor: 'rgba(255, 245, 238, 0.5)',
  },
  tierLeft: {
    flex: 1,
  },
  tierRowName: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    fontWeight: '600',
    color: '#5C4033',
  },
  tierRowNameCurrent: {
    color: '#4CAF50',
  },
  tierRowNameLocked: {
    color: 'rgba(92, 64, 51, 0.4)',
  },
  tierRowDays: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 10,
    color: 'rgba(92, 64, 51, 0.6)',
    marginTop: 2,
  },
  tierRowDaysLocked: {
    color: 'rgba(92, 64, 51, 0.3)',
  },
  tierRowDiscount: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    fontWeight: '600',
    color: '#5C4033',
  },
  tierRowDiscountCurrent: {
    color: '#4CAF50',
  },
  tierRowDiscountLocked: {
    color: 'rgba(92, 64, 51, 0.3)',
  },
  backButton: {
    backgroundColor: '#E8997E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
