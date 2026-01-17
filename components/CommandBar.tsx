// components/CommandBar.tsx
// The Universal Input - Buy, sell, search anything

import React, { useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Animated,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/Colors';

// Intent types
export type CommandIntent =
  | { type: 'search'; query: string }
  | { type: 'buy'; query: string }
  | { type: 'sell'; query: string | null };

// Parse command to determine intent
export function parseCommand(input: string): CommandIntent {
  const lower = input.toLowerCase().trim();

  // "sell" or "sell my X"
  if (lower === 'sell' || lower.startsWith('sell ')) {
    const query = lower.replace(/^sell\s*(my\s*)?/, '').trim() || null;
    return { type: 'sell', query };
  }

  // "buy X" - strip "buy" prefix for search
  if (lower.startsWith('buy ')) {
    const query = lower.replace(/^buy\s+/, '').trim();
    return { type: 'buy', query };
  }

  // Default: search
  return { type: 'search', query: input.trim() };
}

// Get search query from command (strips buy/sell prefixes)
export function getSearchQuery(input: string): string {
  const intent = parseCommand(input);
  return intent.query || '';
}

interface CommandBarProps {
  query: string;
  onChangeQuery: (query: string) => void;
  onFocus: () => void;
  onClear: () => void;
  onSubmit: () => void;
  isActive: boolean;
}

export function CommandBar({
  query,
  onChangeQuery,
  onFocus,
  onClear,
  onSubmit,
  isActive,
}: CommandBarProps) {
  const inputRef = useRef<TextInput>(null);
  const animatedPosition = useRef(new Animated.Value(0)).current;

  // Animate position when active state changes
  useEffect(() => {
    Animated.spring(animatedPosition, {
      toValue: isActive ? 1 : 0,
      useNativeDriver: false,
      tension: 100,
      friction: 12,
    }).start();
  }, [isActive]);

  // Interpolate bottom position (bottom when idle, top when active)
  const bottomPosition = animatedPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [34, Platform.OS === 'ios' ? 60 : 40], // Safe area at top
  });

  const topPosition = animatedPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [1000, 0], // Off-screen when idle
  });

  const handleClear = () => {
    onClear();
    Keyboard.dismiss();
  };

  const handleSubmit = () => {
    if (query.trim()) {
      onSubmit();
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        isActive
          ? { top: topPosition, bottom: undefined }
          : { bottom: bottomPosition, top: undefined },
      ]}
    >
      <Ionicons
        name="search"
        size={20}
        color={theme.textTertiary}
        style={styles.searchIcon}
      />
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={query}
        onChangeText={onChangeQuery}
        onFocus={onFocus}
        onSubmitEditing={handleSubmit}
        placeholder="Buy, sell, search..."
        placeholderTextColor={theme.textTertiary}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {(query.length > 0 || isActive) && (
        <Pressable onPress={handleClear} style={styles.clearButton}>
          <Ionicons name="close-circle" size={20} color={theme.textTertiary} />
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 100,
  },
  searchIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.textPrimary,
    padding: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
});

export default CommandBar;
