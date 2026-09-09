import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * `ImagePicker.launchImageLibraryAsync` can hang forever on web when the file
 * dialog is dismissed without the browser firing its `focus` event (e.g. closed
 * with Escape). That left "Envoi…" buttons stuck until a reload. This races the
 * picker against a focus-based "assume cancelled" fallback so callers never stall.
 */
export async function launchImageLibrarySafe(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult> {
  const pick = ImagePicker.launchImageLibraryAsync(options);
  if (Platform.OS !== 'web' || typeof window === 'undefined') return pick;

  let settled = false;
  void pick.then(() => { settled = true; }).catch(() => { settled = true; });

  return Promise.race([
    pick,
    new Promise<ImagePicker.ImagePickerResult>((resolve) => {
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        // Let a real selection land first; only then treat it as cancelled.
        setTimeout(() => {
          if (!settled) resolve({ canceled: true, assets: null } as ImagePicker.ImagePickerResult);
        }, 1500);
      };
      window.addEventListener('focus', onFocus);
    }),
  ]);
}
