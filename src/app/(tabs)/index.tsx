import { View } from 'react-native';

import { Mirror } from '@/components/Mirror';
import { Colors, Spacing } from '@/constants/theme';
import { SAMPLE_MIRROR_PROPS } from '@shared/contract';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, padding: Spacing.four }}>
      <Mirror {...SAMPLE_MIRROR_PROPS} />
    </View>
  );
}
