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
    outputRange: [0, 0],
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

  // When active, use relative positioning so KeyboardAvoidingView works
  const containerStyle = isActive
    ? [styles.container, styles.containerActive]
    : [styles.container, { bottom: bottomPosition }];

  return (
    <Animated.View style={containerStyle}>
      <Ionicons
        name="search"
        size={20}
        color="#9A9A9A"
        style={styles.searchIcon}
      />
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={query}
        onChangeText={onChangeQuery}
        onFocus={onFocus}
        onSubmitEditing={handleSubmit}
        placeholder="Pay, buy, sell..."
        placeholderTextColor={theme.textTertiary}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {(query.length > 0 || isActive) && (
        <Pressable onPress={handleClear} style={styles.clearButton}>
          <Ionicons name="close-circle" size={20} color="#9A9A9A" />
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    zIndex: 100,
  },
  containerActive: {
    position: 'relative',
    marginBottom: 10,
    left: 0,
    right: 0,
  },
  searchIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    padding: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
});

export default CommandBar;
