# Portföy — Kişisel Birikim & Finansal Hedef Takibi

Tek dosyalık (HTML) bir kişisel portföy panosu: çoklu varlık takibi, çoklu para birimi görünümü
(TRY / USD / EUR / gram altın / BTC / ETH), aylık tasarruf takibi, finansal hedefler ve
10 yıllık bileşik faiz projeksiyonu.

## Yayınlama (GitHub Pages)
1. Bu repo'da **Settings → Pages**'e gir.
2. **Source: Deploy from a branch**, branch **main**, klasör **/(root)** seç, **Save**.
3. Birkaç dakika içinde `https://<kullanici-adi>.github.io/<repo-adi>/` adresinde yayında olur.

`index.html` repo kökünde olduğu için Pages onu otomatik açılış sayfası olarak servis eder.

## Notlar
- Veriler tarayıcıda (localStorage) saklanır; cihazlar arası senkron yoktur.
- "Güncelle" ile güncel fiyatlar elle girilir. İleride n8n + TEFAS/Yahoo ile otomatikleştirilebilir.
- Yatırım tavsiyesi içermez.
