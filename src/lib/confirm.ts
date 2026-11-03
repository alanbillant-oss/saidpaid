import { Alert, Platform } from 'react-native';
import { isDemoMode } from './api';

/** Yes/no question before something destructive. */
export function confirmAction(title: string, cancel: string, yes: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    // The hosted demo runs in a frame where confirm() is unavailable.
    if (isDemoMode || window.confirm(title)) onYes();
    return;
  }
  Alert.alert(title, undefined, [
    { text: cancel, style: 'cancel' },
    { text: yes, style: 'destructive', onPress: onYes },
  ]);
}
