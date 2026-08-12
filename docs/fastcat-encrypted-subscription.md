# FastCat encrypted subscription

FastCat v1 is an opt-in AES-256-GCM wrapper around the existing ClashMeta
subscription. Existing clients keep their current protocol because the encrypted
handler is selected only by the exact query parameter `flag=fastcat-v1`.

Generate two independent keys (each command prints a Base64-encoded 32-byte key):

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Configure the server `.env` (never commit real keys):

```dotenv
FASTCAT_SUBSCRIPTION_ENABLED=true
FASTCAT_SUBSCRIPTION_FLAG=fastcat-v1
FASTCAT_ACTIVE_KID=2026-01
FASTCAT_KEY_CURRENT_ID=2026-01
FASTCAT_KEY_CURRENT=<key A>
FASTCAT_KEY_NEXT_ID=2026-02
FASTCAT_KEY_NEXT=<key B>
```

Refresh Laravel's cached configuration after changing these values:

```bash
php artisan config:clear
php artisan config:cache
```

The matching FastCat client build must receive both IDs and keys through its
`--dart-define` build environment. To rotate, publish a client containing the
next key before changing `FASTCAT_ACTIVE_KID` to that key's ID.
