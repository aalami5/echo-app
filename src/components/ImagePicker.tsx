import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Dimensions,
} from 'react-native';
import * as ExpoImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

interface ImagePickerProps {
  onImageSelected: (uri: string, base64?: string, mimeType?: string, caption?: string) => void;
  onCancel: () => void;
}

export function ImagePickerModal({ onImageSelected, onCancel }: ImagePickerProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const captionRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => {
      setKeyboardVisible(true);
      // Scroll to bottom so caption is visible
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardVisible(false);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const pickImage = async (useCamera: boolean) => {
    try {
      // Request permissions
      if (useCamera) {
        const { status } = await ExpoImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant camera access to take photos.');
          return;
        }
      } else {
        const { status } = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant photo library access.');
          return;
        }
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const result = await (useCamera
        ? ExpoImagePicker.launchCameraAsync({
            mediaTypes: ExpoImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.8,
            base64: true,
          })
        : ExpoImagePicker.launchImageLibraryAsync({
            mediaTypes: ExpoImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.8,
            base64: true,
          }));

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedImage(asset.uri);
        setImageBase64(asset.base64 || null);
        // expo-image-picker provides mimeType, fallback to jpeg
        setImageMimeType(asset.mimeType || 'image/jpeg');
      }
    } catch (error) {
      console.log('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handleConfirm = async () => {
    if (selectedImage) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const trimmed = caption.trim();
      onImageSelected(selectedImage, imageBase64 || undefined, imageMimeType || undefined, trimmed || undefined);
    }
  };

  const handleCancel = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedImage(null);
    setImageBase64(null);
    setImageMimeType(null);
    onCancel();
  };

  return (
    <Modal
      visible={true}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.overlayDismiss} activeOpacity={1} onPress={handleCancel} />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Photo</Text>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {selectedImage ? (
            <ScrollView
              ref={scrollRef}
              style={styles.scrollContainer}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Image
                source={{ uri: selectedImage }}
                style={[styles.preview, keyboardVisible && styles.previewSmall]}
              />
              <View style={styles.captionContainer}>
                <TextInput
                  ref={captionRef}
                  style={styles.captionInput}
                  placeholder="Add a message... (optional)"
                  placeholderTextColor={colors.textSecondary}
                  value={caption}
                  onChangeText={setCaption}
                  multiline
                  maxLength={500}
                  returnKeyType="done"
                  blurOnSubmit
                />
              </View>
              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={styles.previewButton}
                  onPress={() => { setSelectedImage(null); setCaption(''); Keyboard.dismiss(); }}
                >
                  <Ionicons name="refresh" size={20} color={colors.textSecondary} />
                  <Text style={styles.previewButtonText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.previewButton, styles.sendButton]}
                  onPress={handleConfirm}
                >
                  <Ionicons name="send" size={20} color={colors.textInverse} />
                  <Text style={[styles.previewButtonText, styles.sendButtonText]}>
                    Send
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.options}>
              <TouchableOpacity
                style={styles.option}
                onPress={() => pickImage(true)}
              >
                <View style={styles.optionIcon}>
                  <Ionicons name="camera" size={28} color={colors.primary} />
                </View>
                <Text style={styles.optionText}>Take Photo</Text>
                <Text style={styles.optionSubtext}>Use your camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.option}
                onPress={() => pickImage(false)}
              >
                <View style={styles.optionIcon}>
                  <Ionicons name="images" size={28} color={colors.primary} />
                </View>
                <Text style={styles.optionText}>Photo Library</Text>
                <Text style={styles.optionSubtext}>Choose existing photo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  overlayDismiss: {
    flex: 1,
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: typography.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  options: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  option: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  optionText: {
    fontSize: typography.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  optionSubtext: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  scrollContainer: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: spacing.md,
  },
  preview: {
    width: '100%',
    height: 250,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
  },
  previewSmall: {
    height: 120,
  },
  captionContainer: {
    marginTop: spacing.sm,
  },
  captionInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: typography.base,
    color: colors.textPrimary,
    minHeight: 44,
    maxHeight: 100,
  },
  previewActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewButtonText: {
    fontSize: typography.base,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sendButtonText: {
    color: colors.textInverse,
  },
});
