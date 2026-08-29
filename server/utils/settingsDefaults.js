const DEFAULT_SETTINGS = {
  id: 'main',
  siteName: 'الهيف للخدمات العقارية',
  siteDescription: 'مكتب عقاري اكتروني — خبرة وثقة في التسويق والخدمات العقارية',
  logoUrl: '/images/logo-alheef.png',
  faviconUrl: '/assets/favicon.png',
  heroTitle: 'الهيف للخدمات العقارية',
  heroSubtitle: 'مكتب عقاري اكتروني',
  heroImage: '/assets/hero/banner-1920.jpg',
  heroMobileImage: '/assets/hero/banner-mobile.jpg',
  whatsappNumber: '966500000000',
  email: 'info@alheef.com',
  phone: '050 000 0000',
  address: 'الرياض، المملكة العربية السعودية',
  googleMap: '',
  instagram: 'https://instagram.com/alheef',
  twitter: 'https://x.com/alheef',
  snapchat: '',
  tiktok: '',
  primaryColor: '#000000',
  secondaryColor: '#C5A46D',
  footerText: '© الهيف للخدمات العقارية — جميع الحقوق محفوظة',
  aboutText:
    'مكتب عقاري اكتروني يقدم خدمات التسويق والبيع وإدارة الأملاك بمعايير احترافية راقية.',
  visionText: 'أن نكون الخيار الأول للخدمات العقارية الراقية في المملكة.',
  missionText: 'تقديم تجربة عقارية موثوقة وشفافة تليق بتطلعات عملائنا.',
  updatedAt: new Date().toISOString(),
};

const LEGACY_HERO_RE = /images\.unsplash\.com\/photo-1600585154340-be6162a9a2c9/i;

function resolveLegacyHeroImage(url, fallback) {
  const value = String(url || '').trim();
  if (!value || LEGACY_HERO_RE.test(value)) return fallback;
  return value;
}

module.exports = { DEFAULT_SETTINGS, resolveLegacyHeroImage, LEGACY_HERO_RE };
