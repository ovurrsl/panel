# DigitalTwin — kimlik doğrulama ve konsol

Devir sırasının **dokuz adımının tamamı**. Kaynak: `../project/DigitalTwin Rebuild Plan.dc.html`
(sözleşme) ve `../project/DigitalTwin Auth Console v3.dc.html` (referans davranış).
İkisi çeliştiğinde doküman geçerli.

Yığın: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 `@theme` · MySQL 8.

---

## Kurulum

```bash
npm install
cp .env.example .env.local        # değerleri doldurun
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # SECRET_ENCRYPTION_KEY
npm run db:migrate                # veritabanını yoksa oluşturur, migration'ları uygular
npm run db:seed                   # 1 admin + 3 site + settings satırı + sistem rolleri
npm run db:seed -- --dev          # ek olarak r.ovur ve c.tuna hesapları
npm run dev
```

```bash
npm run test        # biçim, büyük harf, şifre politikası, sözlük paritesi, Esc zinciri
npm run typecheck
npm run build
```

`SECRET_ENCRYPTION_KEY` zorunlu: TOTP sırları ve webhook imza anahtarları bu anahtarla
AES-256-GCM ile şifrelenip saklanıyor. Anahtar değişirse mevcut 2FA kayıtları çözülemez
(kod bunu "kayıtlı değil" olarak okur, 500 atmaz — ama kullanıcılar yeniden kaydolur).

**İlk giriş:** kullanıcı adı `Admin`, şifre `Admin`. Hesap `must_change_password` ile
tohumlanıyor, yani ilk giriş zorunlu olarak 2FA kurulumundan ve şifre belirlemeden geçiyor.

---

## Ne bitti

**1 · Şema ve migration** — `db/migrations/`. Bölüm 10'daki 12 tablo birebir, artı
gerekçesi migration başlığında yazılı üç ek: `roles`, `access_requests`,
`password_resets`. `npm run db:migrate` idempotent; `schema_migrations` tablosu tutuyor.

**2 · Tipler** — `src/lib/types.ts` (bölüm 08 tipleri birebir) ve
`src/lib/api-contract.ts` (her uç için istek/yanıt tipi + zod şeması).

**3 · Kimlik çekirdeği** — argon2id (19 MiB / t=2 / p=1), `sessions` tablosu, HttpOnly
çerez, `failed_attempts` / `locked_until` kilitlenmesi (3 denemede 30 sn, 10 denemede
15 dk), eşzamanlı oturum limiti, kayan boşta kalma penceresi.

**4 · 2FA · davet · şifre** — TOTP kayıt/doğrulama, tek kullanımlık kurtarma kodları,
davet yaşam döngüsü (yenile / iptal, token her yenilemede döner), şifre sıfırlama
(30 dk, tek kullanım) ve ilk girişte zorunlu şifre değiştirme.

**5 · Konsol çatısı** — `ConsoleLayout` + rota korumaları, 11 sekmenin tamamı
adreslenebilir, JS ile ölçülen kırılımlar, EN/TR tam parite, boşta kalma uyarısı.

**6 · Kullanıcılar ve roller** — kullanıcı tablosu (arama, rol filtresi, sıralama,
sayfalama, iskelet/hata/boş durumlar, dar ekranda etiketli kart düzeni), bekleyen talep
şeridi, "Onayla ve ata" diyaloğu, davet formu, kullanıcı çekmecesi (site bazlı rol
döngüsü, etkin izinler, geçici şifre, oturum kapatma, pasifleştir/sil), izin matrisi +
rol kartları, özel rol yaşam döngüsü, Oturumlar sekmesi.

**7 · Siteler · İşler · Entegrasyonlar · Ayarlar** — site kartları ve kurulum formu
(kurulum bir iş olarak kuyruğa alınır, iş bitince site `setup` → `active` geçer),
arşivle/geri al; iş kuyruğu SSE ile canlı (bağlantı kurulamazsa 4 sn yoklama),
tekrar dene/iptal; API anahtarları (ham anahtar yalnız POST yanıtında) ve webhook'lar
(gerçek test gönderimi, duraklat/sürdür, 3 hatada `failing`); kurum ayarları tek satır.

**8 · Tanılama · telemetri · sürüm notları** — Genel bakış (4 sn'de bir sağlık yoklaması,
sparkline'lar, bağlı kullanıcılar, son olaylar; sekme gizliyken yoklama duruyor); Tanılama
(imleç tabanlı sayfalama, seviye/aralık/aktör süzgeçleri, arama, temizle); Denetim izi
(aynı tablonun değişiklik görünümü, salt okunur); Sürüm notları (sunucuda 60 sn önbellek,
uçuştaki istek paylaşımlı, çevrimdışıyken paketli anlık görüntü). Tarayıcı hataları
`ErrorReporter` ile `/api/telemetry` üzerinden tanılama günlüğüne düşüyor.

**7 kimlik ekranı** — giriş (iki panelli hero), 2FA doğrulama, 2FA kurulumu, kurtarma
ile giriş, şifre sıfırlama, yeni şifre / hoş geldiniz, hesap talebi. İki tema, iki dil.

**9 · Cila** — axe denetimi (17 rota × 2 tema × 2 dil = 68 render, sıfır ihlal), klavye ve
Esc zinciri denetimi, Lighthouse bütçesi, biçim testleri, boş durum ve mikro metin
taraması. Ayrıntı aşağıda.

**Sonrasında** — prototipteki toplu işlem çubuğu (`POST /api/users/bulk`) ve denetim izinin
iki dilde okunması.

## Ne bitmedi

Dokuz adımın tamamı bitti; 11 sekmede yer tutucu kalmadı, prototipteki toplu işlemler de
eklendi.

Marka varlığı yerine oturdu: `NetlogLogo` ve `NetlogMark` kurumsal dosyadan, yol yoluna.
Sekme ikonu da aynı amblemden üretildi.

E-posta gönderimi `src/lib/mail.ts` içinde bir dikiş yeri — şu an konsola yazıyor,
bağlantılar dev logunda görünüyor. Gerçek SMTP tek dosyalık bir değişiklik.

Giriş ekranındaki üç kaynak bağlantısı (editör projeleri, görüntüleyici, kılavuzlar)
ayrı bir uygulamaya ait. `NEXT_PUBLIC_EDITOR_URL` tanımlıysa gerçek bağlantı olarak
çıkıyorlar, tanımlı değilse hiç görünmüyorlar — hiçbir yere gitmeyen bir düğme,
düğmesizlikten kötüdür. Sürüm notları bu uygulamada olduğu için her zaman duruyor.

---

## Sözleşmeden bilinçli sapmalar

| Konu | Karar |
|---|---|
| `sessions.mfa_pending` | Şemada yok, eklendi. İki adımlı girişte şifre doğrulanmış ama OTP borçlu oturumu tutuyor; korumalar bunu "giriş yapılmamış" sayıyor. |
| `invitations.public_id` | Şemada yok, eklendi. Bölüm 08 `Invitation.id`'yi ULID diyor ve uçlar `/api/invitations/:id` — iç BIGINT dışarı sızmasın diye. |
| `roles`, `access_requests`, `password_resets` | Bölüm 10'da DDL'i yok ama üçü de dokümanın istediği ekranların arkasında duruyor. Ayrı migration'da, gerekçesiyle. |
| Admin'in e-postası | Prototipte Admin'in e-postası yok; şema `email NOT NULL UNIQUE` diyor ve doküman geçerli. Hesap eski panelin `admin@netlog.com.tr` adresini taşıyor. |
| Ayarlar / Entegrasyonlar izni | `access_settings` yerine `admin_access`. `access_settings` editörün kendi ayarları için Editor seviyesi bir izin; kurum ayarları satırı ve ham API anahtarları farklı bir yetki alanı. |
| Konsolun tamamı | Eski panel `/admin`'i `admin_access` arkasına koyuyordu. v3'ün "salt okunur" durumu ancak yönetici olmayan biri konsolu açabiliyorsa anlamlı — o yüzden kabuk her oturuma açık, kapı sekme başına. |
| Büyük harf dönüşümü | CSS `text-transform: uppercase` kullanılmıyor. `<html lang="tr">` ayarlı olmasına rağmen Chromium İŞLEMCİ yerine ISLEMCI basıyor; her etiket `<Caps>` üzerinden `toLocaleUpperCase` ile dönüyor. Rol adları ve izin anahtarları `<Caps invariant>` kullanıyor — aksi hâlde Türkçe kural "Admin"i "ADMİN" yapıyor. |
| Satır içi düzenleme | Prototipte tablo satırı yerinde düzenleniyordu. Düzenleme çekmeceye taşındı: aynı alanlar iki yerde ayrı ayrı doğrulanmıyor ve maskeli şifre kolonu tamamen kalktı (geçici şifre yalnız bir kez, diyalogda gösteriliyor). Son kolon artık `Davet` durumunu taşıyor. |
| Mobil başlıkta "Git" | 402 px'te marka etiketini dışarı ittiği ve sekme şeridi zaten tüm hedefleri listelediği için dar ekranda gizli. |
| İş worker'ı | Doküman tek worker + FIFO diyor. Claim `SELECT … FOR UPDATE SKIP LOCKED` ile yapılıyor, yani ikinci bir worker eklemek kod değişikliği gerektirmiyor. Ama döngü **uygulama içinde** çalışıyor (`startJobWorker`); birden fazla instance'ta ayrı bir sürece taşınmalı — claim doğru kalır, yalnız boşa uyanma çoğalır. |
| İş ilerlemesi | Gerçek iş kendi ilerlemesini bildirir; şimdilik worker adım adım ilerletiyor. Kuyruğun, ilerleme çubuğunun ve sitenin "Kuruluyor" durumunun tek gerçeğin üç görünümü olduğunu editör bağlı olmadan da doğrulanabilir kılıyor. |
| Ayarlar → Görünüm | Tema ve dil satırları `settings` satırına yazılmıyor. İkisi de kişi başına tercih (çerez), kurum politikası değil — aynı listede görünüyor ama farklı yere kaydediliyor. |
| Tanılama ve Denetim izi | İki sekme, tek tablo (`audit_log`). Ayıran şey `CHANGE_KINDS`: bir değişiklik kaydı olan `kind` değerleri denetim izine, geri kalanı tanılamaya gidiyor. İki tablo tutmak aynı olayı iki kez yazmayı ya da hangi tarafa yazılacağına çağrı yerinde karar vermeyi gerektirirdi. |
| "Temizle" ne siliyor | Yalnız `info` seviyesindeki, değişiklik olmayan satırlar. `warn`/`error` ve denetim kayıtları duruyor; temizleme işleminin kendisi de bir satır yazıyor. Denetim izinde temizleme düğmesi hiç yok. |
| Denetim mesajlarının dili | Kayıtlar İngilizce saklanıyor, çevresindeki etiketler çevriliyor. Değişmez bir kaydı okunduğu anda çevirmek yanlış — doğru çözüm yapılandırılmış mesaj (kind + meta) ve yerel ayara göre render. Bu tur kapsam dışı, bilinçli bırakıldı. |
| Sayfalama | Günlüklerde imleç (keyset) tabanlı, `OFFSET` değil. Tablo okunurken yazılmaya devam ediyor; `OFFSET` ikinci sayfada satır atlatır ya da tekrarlatır. |
| Sürüm notları kaynağı | Yukarı akış depo adları yalnız `src/lib/changelog.ts` içinde. Girdiler `channel` ('editor' \| 'plugin') taşıyor, ekranlar ürün diliyle yazıyor. İstek istemciden değil sunucudan gidiyor: anonim kota IP başına 60/saat ve prototipte her ziyaretçi kendi isteğini atıyordu. |
| CPU ölçümü | Tek seferlik `cpuUsage` mutlak değil, iki yoklama arasındaki **fark**. Mutlak değer süreç ömrünün ortalamasını verir ve ilk dakikadan sonra hiç kıpırdamaz. 5–95 aralığına kırpılıyor. |
| Açık temanın renkleri | `--dt-muted-fg` 0.556 → 0.52, `--dt-placeholder` 0.72 → 0.55 (koyuda 0.55 → 0.60). Bu arayüzde ikincil metin 8 px'e kadar iniyor ve eski değerler o boyutta 4.08:1 ölçüyordu. Ton aynı, yalnız AA'yı geçecek kadar koyulaştırıldı. |
| Marka rengi metin olarak | `--dt-brand-fg` eklendi: koyuda `#FFC629`, açıkta `#7A5A00`. Açık temada amber metin 1.35:1'di. `--dt-brand` (nokta, dolgu, kenarlık) eski değerini koruyor — onlar metin değil. Amblem her iki temada da `#FFC629`, bu kural değişmedi. Kodda ham `#FFC629` yalnız `netlog-logo.tsx` içinde kaldı. |
| Saydamlıkla soluklaştırma | İptal edilen API anahtarı satırı `opacity-55`, arşivlenen site kartı `opacity-60` ile soluklaştırılıyordu; ikisi de bütün satırı 2.98:1'e düşürüyor. Durum artık üstü çizili anahtar + "İptal edildi" etiketi ve kesikli kenarlıkla anlatılıyor. |
| Esc zinciri | Katman başına `window` dinleyicisi yerine bir yığın (`src/lib/escape-layers.ts`). Eski kurulumda sekiz diyaloğun beşi Esc'i hiç dinlemiyordu ve çekmece kendi diyaloglarının durumunu elle sıralıyordu. |
| Odak yönetimi | `aria-modal` odak tuzağı sağlamaz. `useModalFocus` üç yükümlülüğü yerine getiriyor: açılışta odak içeri, Tab/Shift+Tab içeride, kapanışta tetikleyiciye geri. |
| Toplu işlemler | Prototipin dört işleminden üçü aynen var (rolü Viewer yap, pasifleştir, sil). "2FA zorunlu kıl" yerine **oturumları kapat** kondu: kimse başkasının adına doğrulayıcı kaydedemez, kurum geneli zorunluluk zaten bir ayar, ve oturumları kapatmak seçili hesapların tamamını yürürlükteki politikadan geçen giriş kapısına geri gönderir. |
| Toplu işlemde onay | Hepsi sayıyı ve atlama kuralını yazan bir onay diyaloğundan geçiyor. **Sil** ayrıca hesap sayısının yazılmasını istiyor — kelime değil sayı, çünkü sayı iki dilde de aynı ve kullanıcıyı kaç satır seçtiğini okumaya zorluyor. |
| Toplu seçim kapsamı | Seçim gördüğünüz sayfayla sınırlı; arama, süzgeç, sıralama ya da sayfa değişince sıfırlanıyor. Sayfalar arası taşınan bir seçim, birkaç süzgeç önce ekrandan çıkmış hesaplara tek tıkla işlem yapardı. |
| Toplu işlemde denetim | Etkilenen hesap başına bir denetim satırı yazılıyor, tek bir "12 hesap değişti" özeti değil. Özet ucuz olurdu ve izin var olma sebebi olan hesap bazlı geçmişi yok ederdi. |
| Komut paleti | ⌘K / Ctrl+K. Prototipin üç grubu (sekmeler, eylemler, kişiler) duruyor, iki fark var: rolün yapamadığı hiçbir şey listelenmiyor — palet bir kısayol, ikinci bir kapı değil — ve kişi araması sunucudan geliyor, ilk sayfada ne varsa onunla sınırlı değil. |
| Diyalog arka planı | `aria-modal` odak tuzağı sağlamaz ve ekran okuyucunun sanal imlecini de durdurmaz. Diyalog ağacın içinde render edildiği için işaretlenecek tek bir üst öğe yok: yukarı doğru yürüyüp her atanın *diğer* çocukları `inert` yapılıyor, kapanışta yalnız bu çağrının değiştirdikleri geri alınıyor. Çekmecenin içinden açılan diyalog çekmeceyi de kapsıyor. |
| Denetim izinin dili | `audit_log.message` İngilizce saklanmaya devam ediyor — değişmez kayıt, dışa aktarma ve adli inceleme o kolonun sabit kalmasını ister. Her yazım ayrıca bir olay anahtarı + parametrelerini `meta` içine koyuyor; ekranlar onu okuyup okuyucunun dilinde basıyor. Yeni kolon yok, migration yok; olay taşımayan eski satırlar sakladıkları cümleyle görünmeye devam ediyor ve bu geri düşüş kalıcı. |

---

## Yapı

```
db/migrations/         001 şema · 002 roller + talepler · 003 şifre sıfırlama
scripts/               migrate.ts · seed.ts
src/app/               rotalar (kimlik ekranları, /console/[tab], /api/**)
src/components/
  auth/                7 kimlik ekranı + OtpInput + AuthShell
  console/             ConsoleShell · UsersTab · UserDrawer · RolesTab · SessionsTab
                       SitesTab · JobsTab · IntegrationsTab · SettingsTab · OverviewTab
                       LogsTab · AuditTab · UpdatesTab · Sparkline · InviteForm · AssignDialog
  error-reporter.tsx   window.onerror + unhandledrejection → /api/telemetry
  ui/                  Button, Field, Caps, Dialog, GridBackdrop, NetlogLogo…
                       modal-focus.ts — odak içeri / tuzak / geri
tests/                 vitest: format · casing · password-policy · i18n · logs · escape-layers · audit-events
src/lib/
  auth/                password · session · totp · invitations · reset · lockout · guard · roles · audit · crypto
  users.ts             liste/detay sorguları, atamalar, dış kullanıcı kısıtı, TR sıralama
  jobs.ts              FIFO kuyruk, SKIP LOCKED claim, worker döngüsü
  integrations.ts      API anahtarları (hash) ve webhook'lar (imza sırrı şifreli)
  logs.ts              tanılama/denetim ayrımı (CHANGE_KINDS), imleç sayfalama, temizle
  health.ts            CPU/bellek yoklaması (CPU iki ölçüm arası fark)
  changelog.ts         yukarı akış okuması, 60 sn önbellek, çevrimdışı anlık görüntü
  i18n/                en.ts · tr.ts (Dictionary tipiyle parite zorunlu)
  types.ts             bölüm 08 tipleri
  api-contract.ts      uç sözleşmeleri + zod şemaları
  audit-events.ts      olay anahtarları + meta'dan okuma (saklanan kayıt İngilizce kalır)
  casing.ts            yerel ayara duyarlı büyük harf (İ/ı) — <Caps> bunu kullanıyor
  escape-layers.ts     Esc zinciri yığını (menü → palet → çekmece → diyalog)
```

**Marka.** Kaynak `nlg.svg` — kurumsal dosyanın kendisi, yeniden çizim değil. Dosya
ağaçta tutulmuyor: çalışma zamanında kimse yüklemiyor ve uygulamanın kullandığı her şey
zaten bileşendeki yollar. Burada olmayan bir varyant gerekirse git'ten geri alın:
`git show b06626e:nlg.svg > nlg.svg`. O dosya tek tuvalde dört varyant taşıyor (Türkçe ve İngilizce yazım, her biri
düz ve lacivert kutudan ters); konsol Türkçe düz varyantı kullanıyor, çünkü yazı temaya
uyabilen tek versiyon o. Renk kuralı: amblem iki temada da `#FFC629` (marka amblemi,
temalı bir vurgu değil), yazı `--dt-wordmark` (koyu `#F0F0F0`, açık `#002D74`).

Kilidin yazısı üç satır, yani 25–30 px'lik başlık satırında satır başına ~7 px kalıyor.
O yüzden `BrandLockup` ve kimlik ekranları **`NetlogMark`** (yalnız amblem) kullanıyor —
ürün adı zaten yanında duruyor; tam kilit yalnız dikey yeri olan giriş hero'sunda.

Renkler sınıf değil `fill` özniteliği: HTML içindeki bir `<svg><style>` bloğu kendi svg'sine
kapsanmaz, belge geneline uygulanır — aynı sayfadaki iki logo `.cls-3` üzerinde çakışır ve
en son çizilen kazanır. Bu tuzağa varyantları karşılaştırırken düşüldü, kod bu yüzden
öznitelik kullanıyor.

---

## Doğrulama

```bash
npm run test
npm run typecheck
npm run build
```

**Testler** (59 test, 7 dosya). Biçim: 12.480 / 12,480, 15.03.2026 / 15/03/2026, Türkçe
sıralama (ç·ğ·ı·İ·ş·ü), sayısal sıralama (LM3 < LM10). Büyük harf: iki yönlü İ/ı tuzağı ve
`invariant` bayrağının neyi koruduğu. Şifre politikası: beş kural, ölçer eşlemesi ve
kimlik kontrolü. Sözlük: anahtar paritesi, boş dize yok, `{yer tutucu}` çeviride kaybolmuyor,
eşlenmemiş hata kodu ham anahtar olarak ekrana çıkmıyor. Günlükler: `CHANGE_KINDS`
bölümlemesi. Esc zinciri: basış başına tek katman, en üstteki. Denetim olayları: bozuk ya
da eksik `meta` hiçbir zaman fırlatmıyor, hiçbir satır çıplak anahtar ya da doldurulmamış
`{yer tutucu}` basmıyor, İngilizce render saklanan cümleyle birebir aynı.

**Erişilebilirlik.** 17 rota × 2 tema × 2 dil = **68 render, sıfır axe ihlali**
(wcag2a/2aa/21a/21aa). Açık katmanlar da ayrıca denetlendi: temizleme onayı, kullanıcı
çekmecesi, silme onayı. Klavye: odak diyaloğa giriyor, Tab ve Shift+Tab içeride kalıyor,
Esc en üstteki katmanı kapatıyor (çekmece ayakta kalıyor), ikinci basış çekmeceyi
kapatıyor, odak tetikleyiciye dönüyor.

**Lighthouse** (masaüstü, üretim derlemesi). Bütçe olarak kayıt:

| Rota | Perf | Erişilebilirlik | En iyi uygulama | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/signin` | 93 | 100 | 100 | 223 ms | 763 ms | 211 ms | 0 |
| `/console/overview` | 100 | 100 | 100 | 239 ms | 401 ms | 2 ms | 0 |
| `/console/users` | 100 | 100 | 100 | 235 ms | 404 ms | 32 ms | 0 |

`/signin` en ağır ekran: iki panelli hero, perspektif ızgara ve canlı sayaçlar tek sayfada.
244 KB istemci JS ile 93 alıyor; kalan açık kalem React hidrasyonundan gelen ~99 KiB
kullanılmayan JS, ki bu çerçeve tabanı. Konsol rotaları kabuğu paylaştığı için 100.

Cila turunda çıkan ve düzeltilen üç hata: açık temada marka rengiyle yazılmış metin
1.35:1 (tokenlaştırıldı), soluklaştırılmış satırlar 2.98:1 (saydamlık kaldırıldı),
`/favicon.ico` her sayfa yüklemesinde 404 (`src/app/icon.svg` eklendi). Ayrıca kimlik
ekranlarında `<main>` yoktu ve sekiz diyaloğun beşi Esc'i dinlemiyordu.

Akışlar MySQL 8.0.46'ya karşı uçtan uca çalıştırıldı.

**Kimlik:** hatalı şifre → kilit → 2FA kaydı → kurtarma kodu (tek kullanımlık) →
zorunlu şifre değişikliği → konsol; davet yenileme (eski token ölüyor) ve kabulü;
şifre sıfırlama (tek kullanım, diğer oturumları kapatıyor); rol bazlı sekme kapıları.

**Kullanıcılar ve roller:** kullanıcı oluşturma (şifresiz, davetli); kullanıcı adı
çakışması `conflict`; dış hesapta rol yazarken Viewer'a kısıtlanıyor; sitesiz onay
reddediliyor; aynı talep iki kez onaylanamıyor; site ataması ekle/değiştir/kaldır;
geçici şifre bir kez dönüyor ve `must_change_password` bırakıyor; birincil yönetici
silinemiyor ve pasifleştirilemiyor; sistem rolleri düzenlenemiyor/silinemiyor; özel rol
oluştur → izin değiştir → sil (kullanıcılar Viewer'a düşüyor); Editor rolü her yazma
ucunda `forbidden` alıyor ve tabloyu salt okunur görüyor; her mutasyon denetim izine
saklanan değerle yazılıyor.

**Siteler, işler, entegrasyonlar, ayarlar:** site oluşturma iş kuyruğuna düşüyor ve iş
bitince site aktifleşiyor; iki iş sırayla (FIFO) işleniyor; aynı ad `conflict`;
arşivle/geri al ve tekrarında `conflict`; iş iptal/tekrar dene; ham API anahtarı yalnız
oluşturma yanıtında dönüyor, listede yok, veritabanında yalnız 32 baytlık hash var;
`http://` webhook ve olaysız webhook reddediliyor; gerçek test gönderimi 3 hatada
`failing` yapıyor, sürdürme sayacı sıfırlıyor; ayar değişikliği **sunucuda uygulanıyor**
— SSO alan adı eklenince şifreyle giriş `sso_required` veriyor, oturum süresi değişince
`expiresInSeconds` onu izliyor.

**Tanılama, telemetri, sürüm notları:** temizleme 29 `info` satırını sildi, 13 `warn`/
`error` ve 38 denetim satırının tamamı kaldı, işlemin kendisi de yazıldı; iki imleç
sayfası arasında satır yazılmasına rağmen çakışma/atlama olmadı; Editor rolü `/api/logs`
ve `/api/audit`'te `forbidden`, `/api/overview`'da 200 alıyor; telemetri ucu oturumsuz
POST'u 202 ile kabul ediyor; beş eşzamanlı sürüm notu çağrısı tek `fetchedAt` döndürdü
(önbellek + uçuştaki istek paylaşımı); bu konteynerde yukarı akış 403 verdiği için
çevrimdışı yol gerçekten çalıştırıldı ve zaman çizelgesi 07-09 → 07-08 → 06-21 → 06-09
sırasıyla geldi.

Görsel doğrulama, axe denetimi ve Lighthouse ölçümü Chromium ile yapıldı. `playwright`,
`@axe-core/playwright` ve `lighthouse` bağımlılıkları ile prob betikleri her turun sonunda
kaldırılıyor, depoda kalmıyor — kalıcı olan tek test bağımlılığı `vitest`. Denetimi
tekrarlamak isteyen bu üçünü geçici olarak kurup üretim derlemesine karşı çalıştırabilir.

**Bilinen sınır.** Diyaloglar `aria-modal="true"` taşıyor ve odağı tuzağa alıyor, ama
arkadaki içerik `inert` işaretlenmiyor; ekran okuyucunun sanal imleci teknik olarak hâlâ
oraya inebilir. Doğru çözüm diyaloğu `document.body`'ye portal edip kök `<div>`'i `inert`
yapmak; klavye tarafı bundan etkilenmiyor.
