import { Text, View } from 'react-native';

import { Mirror } from '@/components/Mirror';
import { Colors, Spacing } from '@/constants/theme';
import { FIXTURE_LABEL, IS_FIXTURE_MODE, useTodaysLook } from '@/data';
import { SAMPLE_AVATAR } from '@shared/contract';

export default function HomeScreen() {
  const look = useTodaysLook();
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, padding: Spacing.four, gap: Spacing.two }}>
      {IS_FIXTURE_MODE && <Text style={{ color: Colors.mock, fontSize: 12, textAlign: 'center' }}>{FIXTURE_LABEL}</Text>}
      <Mirror avatar={SAMPLE_AVATAR} garmentAssetKeys={look.garmentAssetKeys} />
    </View>
  );
}
