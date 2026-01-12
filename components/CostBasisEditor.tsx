import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme, fonts } from '../constants/Colors';

interface CostBasisEditorProps {
  visible: boolean;
  initialValue: number | null;
  onClose: () => void;
  onSave: (value: string) => void;
}

export default function CostBasisEditor({
  visible,
  initialValue,
  onClose,
  onSave,
}: CostBasisEditorProps) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (visible) {
      setInputValue(initialValue ? initialValue.toString() : '');
    }
  }, [visible, initialValue]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Set cost basis</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>Cancel</Text>
            </Pressable>
          </View>
          <View style={styles.body}>
            <View style={styles.inputRow}>
              <Text style={styles.currency}>$</Text>
              <TextInput
                style={styles.input}
                value={inputValue}
                onChangeText={setInputValue}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.textTertiary}
                autoFocus
              />
            </View>
            <Text style={styles.helperText}>Used for P/L calculations</Text>
            <Pressable style={styles.saveButton} onPress={() => onSave(inputValue)}>
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: theme.textPrimary,
  },
  close: {
    fontSize: 16,
    color: theme.accent,
  },
  body: {
    padding: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  currency: {
    fontSize: 36,
    fontWeight: '600',
    color: theme.textPrimary,
    marginRight: 6,
  },
  input: {
    fontSize: 36,
    fontWeight: '600',
    color: theme.textPrimary,
    minWidth: 120,
    textAlign: 'center',
  },
  helperText: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textInverse,
  },
});
