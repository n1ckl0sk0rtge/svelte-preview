# Signing the JetBrains plugin

The Gradle build reads `CERTIFICATE_CHAIN`, `PRIVATE_KEY`, and `PRIVATE_KEY_PASSWORD` from the environment. Normal builds work without them; signing requires a certificate and private key.

## Create a key and certificate once

Run these commands in a private directory outside this repository. OpenSSL prompts for the key password and certificate identity. Use your vendor identity when filling out the certificate.

```sh
mkdir -p "$HOME/.config/svelte-preview-signing"
cd "$HOME/.config/svelte-preview-signing"
chmod 700 .
umask 077
openssl genpkey -aes-256-cbc -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out private.pem
openssl req -key private.pem -new -x509 -sha256 -days 365 -out chain.crt
```

Keep the encrypted key, password, and certificate backed up securely. The certificate above expires after one year; renew it before it expires. Do not commit signing files or credentials.

## Sign a built release

From `plugin/` on the intended release branch, load the credentials into your shell environment:

```sh
export CERTIFICATE_CHAIN="$(cat "$HOME/.config/svelte-preview-signing/chain.crt")"
export PRIVATE_KEY="$(cat "$HOME/.config/svelte-preview-signing/private.pem")"
```

Set `PRIVATE_KEY_PASSWORD` through your shell's hidden password prompt or a password manager. Then run with JDK 25:

```sh
./gradlew --no-daemon signPlugin verifyPluginSignature
```

The signed ZIP is written to `plugin/build/distributions/` with a `-signed.zip` suffix. Upload the signed ZIP to Marketplace. First-time Marketplace submission is manual; no publishing token is needed for that upload.

For future CI signing, use GitHub Actions secrets with the same three names and pass them as environment variables to the signing task. Automated Marketplace publishing additionally needs a Marketplace token and publishing configuration.

See the [JetBrains signing guide](https://plugins.jetbrains.com/docs/intellij/plugin-signing.html).
