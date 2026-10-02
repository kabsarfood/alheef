# عناصر قديمة بعد دمج الخريطة مع العروض الخاصة

بقيت هذه العناصر عمدًا. لا تحذفها قبل مراجعة الروابط.

- `public/map-legacy.html`: نسخة الخريطة العامة السابقة. الرابط `/map.html` يحوّل إلى لوحة العروض، والروابط العامة في الموقع تشير إلى `/map-legacy.html` حتى لا تختفي الخريطة عن الزوار.
- `dashboard/private-offers-legacy.html` و `dashboard/js/private-offers.js`: إدارة عملاء العروض الخاصة ورموز الدخول. البيانات في `private_offers` و `private_offers_access` لم تُنقل ولم تُحذف.
- `dashboard/map-approvals.html`: بوابة موافقة واتساب ورابط الإدخال. ما زالت هي مسار `/map-submit`.
- جداول `map_publish_requests` و `map_submit_links`: طلبات الموافقة. لا تُحذف.
- عمود `agent_phone`: ما زال للإعلانات القديمة ولوحة تعديل العقار. الرقم الجديد يُحفظ أيضًا مشفرًا في `advertiser_phone_encrypted`. لا يظهر في واجهة العميل.
- `homepage_published`: هو مفتاح ظهور الصفحة الرئيسية. لم يُضف عمود `show_on_homepage` مكرر.

سعر المتر يُحسب عند العرض من السعر والمساحة، ولا يُخزَّن.
