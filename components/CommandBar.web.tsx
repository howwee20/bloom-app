// components/CommandBar.web.tsx
// The Universal Input - Premium Glassy Version for Web

import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Re-export utilities from main file
export type CommandIntent =
  | { type: 'search'; query: string }
  | { type: 'buy'; query: string }
  | { type: 'sell'; query: string | null };

export function parseCommand(input: string): CommandIntent {
  const lower = input.toLowerCase().trim();
  if (lower === 'sell' || lower.startsWith('sell ')) {
    const query = lower.replace(/^sell\s*(my\s*)?/, '').trim() || null;
    return { type: 'sell', query };
  }
  if (lower.startsWith('buy ')) {
    const query = lower.replace(/^buy\s+/, '').trim();
    return { type: 'buy', query };
  }
  return { type: 'search', query: input.trim() };
}

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
}

export function CommandBar({
  query,
  onChangeQuery,
  onFocus,
  onBlur,
  onClear,
  onSubmit,
  isActive,
}: CommandBarProps) {
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = () => {
    onClear();
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur?.();
    }
  };

  const handleSubmit = () => {
    if (query.trim()) {
      onSubmit();
    }
  };

  const handleKeyPress = (e: any) => {
    // Handle Enter key on web
    if (e.key === 'Enter' || e.nativeEvent?.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    onFocus();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur();
  };

  // Inject styles for backdrop-filter
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const styleId = 'command-bar-web-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .command-bar-glass {
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        transition: all 0.2s ease;
      }
      .command-bar-glass:hover {
        background: rgba(255, 255, 255, 0.95) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
      }
      .command-bar-glass:focus-within {
        background: rgba(255, 255, 255, 0.98) !important;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.15) !important;
        border-color: rgba(0, 0, 0, 0.08) !important;
      }
      .command-bar-input::placeholder {
        color: #9a9a9a !important;
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <View
      style={[
        styles.wrapper,
        isActive && styles.wrapperActive,
      ]}
    >
      <div
        className="command-bar-glass"
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(255, 245, 250, 0.9)',
          borderRadius: 24,
          paddingLeft: 18,
          paddingRight: 14,
          paddingTop: 14,
          paddingBottom: 14,
          border: '1px solid rgba(255, 255, 255, 0.6)',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
          width: '100%',
          maxWidth: 420,
        }}
      >
        <Ionicons
          name="search"
          size={20}
          color="#9A9A9A"
          style={{ marginRight: 12 }}
        />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={onChangeQuery}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmitEditing={handleSubmit}
          onKeyPress={handleKeyPress}
          placeholder="Pay, buy, sell..."
          placeholderTextColor="#9A9A9A"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {(query.length > 0 || isFocused) && (
          <Pressable onPress={handleClear} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color="#9A9A9A" />
          </Pressable>
        )}
      </div>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
    zIndex: 100,
  },
  wrapperActive: {
    marginTop: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
    padding: 0,
    backgroundColor: 'transparent',
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
});

export default CommandBar;
