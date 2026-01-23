// components/CommandBar.tsx
// The Universal Input - Buy, sell, search anything

import React, { useRef } from 'react';
import {
  ActivityIndicator,
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

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
  onBlur: () => void;
  onClear: () => void;
  onSubmit: () => void;
  isActive: boolean;
  isLoading?: boolean;
  onHelp?: () => void;
}

export function CommandBar({
  query,
  onChangeQuery,
  onFocus,
  onBlur,
  onClear,
  onSubmit,
  isActive,
  isLoading = false,
  onHelp,
}: CommandBarProps) {
  const inputRef = useRef<TextInput>(null);

  const handleClear = () => {
    onClear();
    Keyboard.dismiss();
  };

  const handleSubmit = () => {
    if (!isLoading && query.trim()) {
      onSubmit();
    }
  };

  const handleHelp = () => {
    onHelp?.();
  };

  const showClear = !isLoading && (query.length > 0 || isActive);
  const showHelp = !isLoading && !!onHelp;
  const showSubmit = !isLoading && query.trim().length > 0;

  const containerStyle = [
    styles.container,
    isActive && styles.containerActive,
    Platform.OS === 'web' && styles.containerWebBlur,
  ];

  return (
    <LinearGradient
      colors={[
        'rgba(255,235,246,0.78)',
        'rgba(236,226,255,0.52)',
      ]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={containerStyle}
    >
      <Ionicons
        name="search"
        size={16}
        color="rgba(255, 255, 255, 0.7)"
        style={styles.searchIcon}
      />
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={query}
        onChangeText={onChangeQuery}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={handleSubmit}
        placeholder="Direct deposit, transfer, invest, buy, sell..."
        placeholderTextColor="rgba(255, 255, 255, 0.55)"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading}
      />
      {isLoading && (
        <ActivityIndicator
          size="small"
          color="rgba(255, 255, 255, 0.7)"
          style={styles.loading}
        />
      )}
      {showClear && (
        <Pressable onPress={handleClear} style={styles.clearButton}>
          <Ionicons name="close-circle" size={16} color="rgba(255, 255, 255, 0.6)" />
        </Pressable>
      )}
      {showSubmit && (
        <Pressable onPress={handleSubmit} style={styles.submitButton}>
          <Ionicons name="arrow-up-circle" size={18} color="rgba(255, 255, 255, 0.85)" />
        </Pressable>
      )}
      {showHelp && (
        <Pressable onPress={handleHelp} style={styles.helpButton}>
          <Ionicons name="help-circle-outline" size={16} color="rgba(255, 255, 255, 0.7)" />
        </Pressable>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 9999,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    // Frosted glass pink that blends with the card gradient
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    shadowColor: '#D8B3E8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  containerActive: {
    marginBottom: 3,
  },
  containerWebBlur: {
    backdropFilter: 'blur(18px)' as any,
    WebkitBackdropFilter: 'blur(18px)' as any,
  },
  searchIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Regular',
    color: 'rgba(255, 255, 255, 0.95)',
    padding: 0,
  },
  clearButton: {
    marginLeft: 5,
    padding: 2,
  },
  submitButton: {
    marginLeft: 4,
    padding: 2,
  },
  helpButton: {
    marginLeft: 4,
    padding: 2,
  },
  loading: {
    marginLeft: 6,
  },
});

export default CommandBar;
