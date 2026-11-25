# ReelFlow — delivery outcomes

## URL Reel publik dapat ditambahkan dan divalidasi
- Pengguna dapat memasukkan URL Reel Facebook publik dari domain Facebook atau fb.watch.
- URL di luar domain yang didukung ditolak dengan pesan yang mudah dipahami.
- URL duplikat tidak ditambahkan dua kali ke antrean.

## Reel ditampilkan melalui embed resmi Facebook
- Aplikasi menggunakan embed resmi Facebook dan tidak mengunduh atau memproses ulang video.
- Aplikasi mencoba autoplay muted melalui parameter embed yang didukung.
- Aplikasi menampilkan pesan informatif jika browser atau izin embed Facebook menolak autoplay.

## Kontrol pemutaran dan antrean tersedia
- Pengguna dapat mencoba memutar ulang Reel aktif, menghentikan pemuatan embed, membuka Reel di Facebook, dan berpindah ke item berikutnya/sebelumnya.
- Pengguna dapat menambahkan, memilih, dan menghapus URL dari antrean sederhana.
- Antrean disimpan di browser agar tetap tersedia setelah halaman dimuat ulang.

## Antarmuka responsif dan rute preview tersedia
- Halaman memiliki layout responsif untuk layar mobile dan desktop.
- `GET /manus-routes.json` mengembalikan route halaman utama.
- Preview berjalan melalui perintah dev yang dikelola platform.
