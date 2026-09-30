/**
 * قراءة إعلان منسوخ بالعربية. لا يستدعي أي خدمة خارجية.
 * النص الأصلي يبقى كما هو؛ هذا الملف يستخرج الحقول فقط.
 */

const DISTRICTS = {
  الرياض: [
    'العليا', 'الملز', 'المربع', 'الورود', 'السليمانية', 'المحمدية', 'الرائد',
    'النخيل', 'حطين', 'الملقا', 'العقيق', 'الصحافة', 'الغدير', 'النفل', 'الوادي',
    'المروج', 'الربيع', 'الندى', 'الياسمين', 'النرجس', 'الفلاح', 'اشبيلية', 'اليرموك',
    'الخليج', 'قرطبة', 'الجنادرية', 'المونسية', 'النسيم', 'الروضة', 'الفيصلية',
    'الرمال', 'السلام', 'الوزارات', 'الديرة', 'الشميسي', 'العمل', 'العزيزية', 'الشفا',
    'العريجاء', 'ظهرة لبن', 'طويق', 'بدر', 'نمار', 'المهدية', 'الدرعية', 'حي السفارات',
    'المنصورة',
  ],
};

const CITIES = ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الظهران', 'الطائف', 'تبوك', 'أبها', 'خميس مشيط', 'بريدة', 'حائل', 'نجران', 'جازان', 'ينبع', 'الأحساء', 'الجبيل', 'القطيف', 'الخرج', 'عرعر', 'سكاكا', 'الباحة', 'العلا'];

const DIGIT_MAP = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

function normalizeDigits(value) {
  return String(value ?? '').replace(/[٠-٩۰-۹]/g, (ch) => DIGIT_MAP[ch] || ch);
}

function fold(value) {
  return normalizeDigits(value)
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compass(word) {
  const text = fold(word);
  if (!text) return '';
  if (text.includes('جنوب')) return 'جنوب';
  if (text.includes('شمال')) return 'شمال';
  if (text.includes('شرق')) return 'شرق';
  if (text.includes('غرب')) return 'غرب';
  return '';
}

function compassAdverb(direction) {
  if (direction === 'جنوب') return 'جنوباً';
  if (direction === 'شمال') return 'شمالاً';
  if (direction === 'شرق') return 'شرقاً';
  if (direction === 'غرب') return 'غرباً';
  return '';
}

function findPlace(folded) {
  let city = '';
  CITIES.forEach((name) => {
    if (folded.includes(fold(name))) city = name;
  });
  let district = '';
  let districtCity = '';
  Object.entries(DISTRICTS).forEach(([placeCity, names]) => {
    names.forEach((name) => {
      const token = fold(name);
      if (token.length < 3 || !folded.includes(token)) return;
      if (token.length >= fold(district).length) {
        district = name;
        districtCity = placeCity;
      }
    });
  });
  if (!city && districtCity) city = districtCity;
  return { city, district };
}

function findType(folded) {
  if (/ارض\s*تجار/.test(folded)) return 'أرض تجارية';
  if (/ارض\s*زراع/.test(folded)) return 'أرض زراعية';
  if (/اراضي|ارض/.test(folded)) return 'أرض سكنية';
  if (/دوبلكس|دبلكس/.test(folded)) return 'دوبلكس';
  if (/فلل|فيل|فله/.test(folded)) return 'فيلا';
  if (/شقق|شقه/.test(folded)) return 'شقة';
  if (/برج/.test(folded)) return 'برج';
  if (/عمار/.test(folded)) return 'عمارة';
  if (/قصر/.test(folded)) return 'قصر';
  if (/استراح/.test(folded)) return 'استراحة';
  if (/محل/.test(folded)) return 'محل';
  if (/مكتب/.test(folded)) return 'مكتب';
  return '';
}

function findListing(folded) {
  if (/للايجار|ايجار/.test(folded)) return { listingType: 'rent', assumed: false };
  if (/طلب\s*شراء/.test(folded)) return { listingType: 'buy_request', assumed: false };
  if (/للبيع|(^| )بيع( |$)/.test(folded)) return { listingType: 'sale', assumed: false };
  return { listingType: 'sale', assumed: true };
}

function findArea(folded) {
  const match = folded.match(/المساح[هة]\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const n = Number(match[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function findPlanPlot(folded) {
  const paired = folded.match(/رقم\s*(\d+)\s*مخطط\s*([0-9]+(?:\s*\/\s*[0-9\u0600-\u06FFa-z]+)?)/i);
  if (paired) return { plotNumber: paired[1], planNumber: paired[2].replace(/\s+/g, '') };
  const plan = folded.match(/مخطط\s*([0-9]+(?:\s*\/\s*[0-9\u0600-\u06FFa-z]+)?)/i);
  const plot = folded.match(/قطع[هة]\s*(\d+)/);
  return {
    plotNumber: plot ? plot[1] : '',
    planNumber: plan ? plan[1].replace(/\s+/g, '') : '',
  };
}

function findStreets(folded) {
  const re = /(?:^|[\sو])شارع\s*(\d+)\s*(?:م|متر)?\s*(شمالي|جنوبي|شرقي|غربي|شمال|جنوب|شرق|غرب|شمالا|جنوبا|شرقا|غربا)?/g;
  const streets = [];
  let match = re.exec(folded);
  while (match) {
    streets.push({ width: match[1], direction: compass(match[2]) });
    match = re.exec(folded);
  }
  return streets;
}

function facadeFromStreets(streets) {
  return streets.map((street) => {
    const side = compassAdverb(street.direction);
    return `شارع ${street.width}م${side ? ` ${side}` : ''}`;
  }).join(' و');
}

function findPrice(raw) {
  const folded = fold(raw);
  if (/مليونين/.test(folded)) {
    const extra = folded.match(/مليونين\s*و\s*(\d+)/);
    let price = 2000000;
    if (extra) {
      const n = Number(extra[1]);
      price += n < 1000 ? n * 1000 : n;
    }
    return { price, priceType: 'fixed' };
  }
  const million = folded.match(/مليون(?:\s*و\s*(\d+))?/);
  if (million) {
    let price = 1000000;
    if (million[1]) {
      const n = Number(million[1]);
      price += n < 1000 ? n * 1000 : n;
    }
    return { price, priceType: 'fixed' };
  }
  const labeled = folded.match(/السعر\s*[:\-]?\s*(\d[\d,]*)/);
  if (labeled) return { price: Number(labeled[1].replace(/,/g, '')), priceType: 'fixed' };
  const riyal = folded.match(/(\d[\d,]*)\s*ريال/);
  if (riyal) {
    const price = Number(riyal[1].replace(/,/g, ''));
    if (price >= 1000) return { price, priceType: 'fixed' };
  }
  const grouped = folded.match(/(\d{1,3}(?:,\d{3})+)/);
  if (grouped) return { price: Number(grouped[1].replace(/,/g, '')), priceType: 'fixed' };
  return { price: null, priceType: 'auction' };
}

function buildTitle(parsed) {
  const purpose = parsed.listingType === 'rent'
    ? 'للإيجار'
    : (parsed.listingType === 'buy_request' ? 'طلب شراء' : 'للبيع');
  const parts = [parsed.propertyType, purpose];
  if (parsed.district) parts.push(`في ${parsed.district}`);
  const title = parts.filter(Boolean).join(' ').trim();
  return title || 'إعلان عقاري';
}

function parseListingPaste(raw) {
  const original = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  const folded = fold(original);
  const place = findPlace(folded);
  const listing = findListing(folded);
  const streets = findStreets(folded);
  const planPlot = findPlanPlot(folded);
  const price = findPrice(original);
  const primary = streets[0] || {};
  const parsed = {
    propertyType: findType(folded),
    listingType: listing.listingType,
    listingAssumed: listing.assumed,
    city: place.city,
    district: place.district,
    area: findArea(folded),
    planNumber: planPlot.planNumber,
    plotNumber: planPlot.plotNumber,
    streetWidth: primary.width || '',
    direction: primary.direction || '',
    facade: facadeFromStreets(streets),
    street: '',
    price: price.price,
    priceType: price.priceType,
    description: original,
  };
  parsed.title = buildTitle(parsed);
  return parsed;
}

module.exports = {
  parseListingPaste,
  normalizeDigits,
  fold,
};
