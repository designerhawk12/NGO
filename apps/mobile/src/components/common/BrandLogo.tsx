import { Image } from 'react-native';
import { useLanguage } from '../../context/LanguageContext';

export default function BrandLogo({ full = false, width = 52 }: { full?: boolean; width?: number }) {
  const { t } = useLanguage();
  return <Image
    source={full ? require('../../../assets/images/aaf-logo-full.png') : require('../../../assets/images/aaf-logo.png')}
    accessibilityLabel={t(full ? 'Akshaya Aahara Foundation — RIGHT TO EAT, NOT TO WASTE' : 'Akshaya Aahara Foundation')}
    resizeMode="contain"
    style={{ width, maxWidth: '100%', aspectRatio: full ? 2437 / 1740 : 2437 / 1526, marginBottom: 8 }}
  />;
}
