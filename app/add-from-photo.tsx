import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useAuth } from './_layout';
import { fonts, theme } from '../constants/Colors';

interface MatchResult {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  brand: string | null;
}

const CONDITIONS = ['New', 'Like New', 'Used'];

export default function AddFromPhotoScreen() {
  const { session } = useAuth();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState('New');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [custodyType, setCustodyType] = useState<'home' | 'bloom'>('home');
  const [searchResults, setSearchResults] = useState<MatchResult[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickImage = async (fromCamera: boolean) => {
    setError(null);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError('Permission denied. Enable access to continue.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: true });

    if (!result.canceled && result.assets?.length) {
      setImageUri(result.assets[0].uri);
    }
  };

  const searchMatch = async () => {
    if (!name.trim()) {
      setError('Enter a name to search.');
      return;
    }

    setLoadingMatch(true);
    try {
      const query = `${name} ${brand}`.trim();
      const { data, error: searchError } = await supabase
        .from('assets')
        .select('id, name, stockx_sku, image_url, brand')
        .or(`name.ilike.%${query}%,stockx_sku.ilike.%${query}%`)
        .limit(5);

      if (searchError) throw searchError;

      const results = (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        sku: item.stockx_sku,
        image_url: item.image_url,
        brand: item.brand,
      }));

      setSearchResults(results);
    } catch (e: any) {
      setError(e.message || 'Search failed. Try again.');
    } finally {
      setLoadingMatch(false);
    }
  };

  const uploadPhoto = async (uri: string) => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration');
    }

    const fileExt = uri.split('.').pop() || 'jpg';
    const fileName = `photo-${Date.now()}.${fileExt}`;
    const filePath = `${session?.user?.id || 'anon'}/${fileName}`;
    const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: contentType,
    } as any);

    const response = await fetch(`${supabaseUrl}/storage/v1/object/user-uploads/${filePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token || supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Photo upload failed.');
    }

    const { data } = supabase.storage.from('user-uploads').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!session) return;
    if (!imageUri) {
      setError('Add a photo to continue.');
      return;
    }
    if (!name.trim() || !size.trim()) {
      setError('Add a name and size.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const imageUrl = await uploadPhoto(imageUri);
      const price = purchasePrice ? parseFloat(purchasePrice) : 0;
      const attributes = {
        condition,
        brand: brand || null,
      };

      const { error: rpcError } = await supabase.rpc('add_home_token', {
        p_sku: selectedMatch?.sku || null,
        p_product_name: name.trim(),
        p_size: size.trim(),
        p_product_image_url: imageUrl,
        p_purchase_price: Number.isNaN(price) ? 0 : price,
        p_custody_type: custodyType,
        p_attributes: attributes,
      });

      if (rpcError) throw rpcError;

      router.back();
    } catch (e: any) {
      setError(e.message || 'Failed to add item.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add from Photo</Text>
          <Pressable style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.photoSection}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>Add a photo</Text>
              </View>
            )}
            <View style={styles.photoButtons}>
              <Pressable style={styles.photoButton} onPress={() => pickImage(true)}>
                <Text style={styles.photoButtonText}>Take Photo</Text>
              </Pressable>
              <Pressable style={styles.photoButton} onPress={() => pickImage(false)}>
                <Text style={styles.photoButtonText}>Upload</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Item Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Nike Air Max 1"
              placeholderTextColor={theme.textSecondary}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.sectionLabel}>Brand (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Nike"
              placeholderTextColor={theme.textSecondary}
              value={brand}
              onChangeText={setBrand}
            />

            <Text style={styles.sectionLabel}>Size</Text>
            <TextInput
              style={styles.input}
              placeholder="10"
              placeholderTextColor={theme.textSecondary}
              value={size}
              onChangeText={setSize}
            />

            <Text style={styles.sectionLabel}>Condition</Text>
            <View style={styles.conditionRow}>
              {CONDITIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.conditionPill, condition === option && styles.conditionPillActive]}
                  onPress={() => setCondition(option)}
                >
                  <Text style={[styles.conditionText, condition === option && styles.conditionTextActive]}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Purchase Price (optional)</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceCurrency}>$</Text>
              <TextInput
                style={styles.priceInput}
                value={purchasePrice}
                onChangeText={setPurchasePrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            <Text style={styles.sectionLabel}>Custody</Text>
            <View style={styles.conditionRow}>
              {(['home', 'bloom'] as const).map((option) => (
                <Pressable
                  key={option}
                  style={[styles.conditionPill, custodyType === option && styles.conditionPillActive]}
                  onPress={() => setCustodyType(option)}
                >
                  <Text style={[styles.conditionText, custodyType === option && styles.conditionTextActive]}>
                    {option === 'home' ? 'Home' : 'Bloom'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Match to catalog (optional)</Text>
            <Pressable style={styles.matchButton} onPress={searchMatch}>
              <Text style={styles.matchButtonText}>{loadingMatch ? 'Searching…' : 'Find match'}</Text>
            </Pressable>
            {searchResults.length > 0 && (
              <View style={styles.matchResults}>
                {searchResults.map((result) => (
                  <Pressable
                    key={result.id}
                    style={styles.matchRow}
                    onPress={() => {
                      setSelectedMatch(result);
                      setSearchResults([]);
                    }}
                  >
                    {result.image_url ? (
                      <Image source={{ uri: result.image_url }} style={styles.matchImage} />
                    ) : (
                      <View style={[styles.matchImage, styles.matchImagePlaceholder]}>
                        <Text style={styles.matchImageText}>{result.name.charAt(0)}</Text>
                      </View>
                    )}
                    <View style={styles.matchInfo}>
                      <Text style={styles.matchName} numberOfLines={1}>{result.name}</Text>
                      <Text style={styles.matchSku}>{result.sku || 'No SKU'}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            {selectedMatch && (
              <View style={styles.matchSelected}>
                <Text style={styles.matchSelectedText}>Matched to {selectedMatch.name}</Text>
              </View>
            )}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={theme.textInverse} />
            ) : (
              <Text style={styles.submitText}>Add to Wallet</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: theme.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: theme.textSecondary,
  },
  content: {
    paddingHorizontal: 16,
  },
  photoSection: {
    marginBottom: 24,
  },
  photoPreview: {
    width: '100%',
    height: 240,
    borderRadius: 16,
  },
  photoPlaceholder: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: 15,
    color: theme.textSecondary,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  photoButton: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.textPrimary,
    marginBottom: 12,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  conditionPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  conditionPillActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  conditionText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  conditionTextActive: {
    color: theme.textInverse,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  priceCurrency: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    marginRight: 6,
  },
  priceInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  matchButton: {
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  matchButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  matchResults: {
    marginTop: 12,
    gap: 8,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 10,
  },
  matchImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  matchImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  matchImageText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: theme.accent,
  },
  matchInfo: {
    flex: 1,
  },
  matchName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  matchSku: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  matchSelected: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  matchSelectedText: {
    fontSize: 13,
    color: theme.success,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    color: theme.error,
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textInverse,
  },
});
