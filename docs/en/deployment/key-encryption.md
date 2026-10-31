# Private-key envelope encryption (✅ implemented) {#key-encryption}

JWT signing private keys are no longer stored as plaintext PEM in the database. They are encrypted
with AES-256-GCM before being written, and the key-encryption key (KEK) lives only in the process
environment — **never in the database**.

## Why

A private key is the root credential that can mint tokens for any user. Stored in plaintext, any
path to the database (backup file, read replica, SQL injection, a leaked dump) is immediately
equivalent to holding signing capability. Envelope encryption splits "dump the DB" and "obtain the
key" into two problems: the attacker needs both the database and the deployed KEK.

> ⚠️ This is **not** a KMS/HSM. The KEK still lives in the process environment, so anyone who can
> read `/proc/<pid>/environ` or obtain the deployment secrets can decrypt. It addresses
> database-side leakage, not full host compromise. If you need stronger semantics, replace
> `seal()` / `open()` in `src/framework/keys/envelope.js` — the only entry point.

## Configuration

Five variables (see `.env.example`):

| Variable | Meaning |
| --- | --- |
| `KEY_ENCRYPTION_KEY` | current KEK, 32 bytes (64 hex chars or 44-char base64). **Empty = keep storing plaintext** |
| `KEY_ENCRYPTION_KEY_ID` | identifier of the current KEK, default `k1`; recorded in the ciphertext |
| `KEY_ENCRYPTION_KEY_PREVIOUS` | previous KEK kept during rotation (decrypt only) |
| `KEY_ENCRYPTION_KEY_PREVIOUS_ID` | identifier of the previous KEK, default `k0` |
| `KEY_ENCRYPTION_REQUIRED` | when `true`, a missing KEK refuses to boot (recommended in production) |

Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Rollout order

1. Distribute the KEK to **all** instances (they must agree, otherwise A writes what B cannot read);
2. deploy the new code (new keys are written encrypted; existing plaintext rows still read fine);
3. run the migration to convert historical plaintext rows:

```bash
node scripts/migrate-key-encryption.js --dry-run   # how many rows will move
node scripts/migrate-key-encryption.js             # execute
node scripts/migrate-key-encryption.js --verify    # verify: all ciphertext, all decryptable
```

4. Once `--verify` passes, set `KEY_ENCRYPTION_REQUIRED=true` so a misconfiguration cannot silently
   fall back to plaintext.

The migration is idempotent: rows already encrypted are skipped, and each row is updated with a
value-guarded `UPDATE`, so concurrent writes during the migration are not overwritten.

## Storage format

```
enc:v1:<keyId>:<base64(iv[12] || tag[16] || ciphertext)>
```

- the prefix lets plaintext and ciphertext rows coexist during a rolling upgrade;
- `keyId` supports KEK rotation (old and new side by side);
- AAD binds the row's `name` (kid): ciphertext cannot be moved between rows. Otherwise anyone with
  write access to the DB could copy row A's ciphertext into row B and make the service sign as A.

Rotating the KEK: move the current value into `KEY_ENCRYPTION_KEY_PREVIOUS`, give the new KEK a new
ID, point `KEY_ENCRYPTION_KEY` at it and restart — old ciphertext opens through PREVIOUS. You can
re-seal later with a script, or let the old key retire naturally.

## Failure semantics

- Tampered ciphertext / AAD mismatch / unknown KEK → **throw**; ciphertext is never handed to the
  signing path as if it were PEM;
- with no KEK configured, startup only warns (so existing plaintext deployments keep working);
  `KEY_ENCRYPTION_REQUIRED=true` turns that into a hard failure;
- if the migration finds rows that are encrypted but cannot be opened, it fails — that means the
  KEK is wrong, and reporting "migration succeeded" there would be the most dangerous outcome.

## Tests

- `src/__tests__/keys-envelope.test.js`: round trip, random IV, tamper detection, AAD binding, KEK
  rotation, legacy plaintext compatibility, invalid config, startup self-check, and the repository
  layer ("encrypted at write, PEM at read").
- `src/__tests__/keys.test.js`: key lifecycle and end-to-end JWT signing/verification (unaffected by
  encryption).
