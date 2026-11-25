# ReelFlow Resolver Worker

Worker ini menyediakan `GET /resolve?url=<facebook-url>`. Ia hanya menerima domain Facebook/fb.watch, mengikuti redirect terbatas, lalu mengembalikan URL kanonis seperti `/reel/...`.

## Deploy melalui GitHub Actions

Tambahkan dua repository secrets pada GitHub:

- `CLOUDFLARE_API_TOKEN`: API Token Cloudflare dengan izin Workers Scripts Edit.
- `CLOUDFLARE_ACCOUNT_ID`: Account ID Cloudflare.

Setelah secret tersedia, push perubahan pada folder `worker/`. Workflow `Deploy ReelFlow resolver` akan menjalankan Wrangler dan Worker tersedia di `https://reelflow-resolver.<subdomain>.workers.dev`.

Worker tidak mengunduh atau menyimpan video. Ia hanya mengikuti redirect URL dan mengembalikan JSON. URL privat, URL yang meminta login, atau redirect non-Facebook akan ditolak.
