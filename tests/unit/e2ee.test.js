/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createKeystore, unlockKeystore, lockKeystore, isUnlocked, getSessionKid } from '../../src/keystore.js';
import { encryptArticlePayload } from '../../src/doc.js';
import { decryptArticleInPlace } from '../../src/init.js';
import { removeEncryptedKeystore } from '../../src/storage.js';
import { isJWE } from '../../src/crypto.js';
import Config from '../../src/config.js';

const PASSPHRASE = 'correct horse battery staple';

const ARTICLE_HTML = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <title>Secret Title</title>
  </head>
  <body>
    <main>
      <article about="" typeof="schema:Article">
        <h1>Secret Title</h1>
        <p>Top secret content.</p>
      </article>
    </main>
  </body>
</html>`;

function extractJWE(encryptedHtml) {
  const parsed = new DOMParser().parseFromString(encryptedHtml, 'text/html');
  return parsed.getElementById('dokieli-e2ee').textContent.trim();
}

function injectEncryptedArticle(jwe) {
  const article = document.createElement('article');
  article.id = 'e2ee-test-article';
  article.setAttribute('data-encrypted', 'true');
  const script = document.createElement('script');
  script.id = 'dokieli-e2ee';
  script.type = 'application/jose';
  script.textContent = jwe;
  article.appendChild(script);
  document.body.appendChild(article);
  return article;
}

beforeEach(async () => {
  lockKeystore();
  await removeEncryptedKeystore();
  Config.Session = { isActive: false };
  Config.User.IRI = null;
  Config.User.Encryption = {
    Enabled: false,
    KeyId: null,
    KeystoreURL: null,
    StorageSyncFailed: false,
    Document: false,
    DocumentEncrypt: false
  };
});

afterEach(() => {
  document.getElementById('e2ee-test-article')?.remove();
  document.getElementById('dokieli-e2ee')?.remove();
});

describe('E2EE document round trip', () => {
  test('encryptArticlePayload replaces the article body and title with a JWE envelope', async () => {
    await createKeystore(PASSPHRASE);

    const encrypted = await encryptArticlePayload(ARTICLE_HTML);

    expect(encrypted).not.toContain('Top secret content.');
    expect(encrypted).not.toContain('Secret Title');
    expect(encrypted).toContain('data-encrypted="true"');
    expect(encrypted).toContain('application/jose');
    expect(isJWE(extractJWE(encrypted))).toBe(true);
    expect(Config.User.Encryption.Document).toBe(true);
  });

  test('returns the input unchanged when the keystore is locked', async () => {
    expect(isUnlocked()).toBe(false);
    expect(await encryptArticlePayload(ARTICLE_HTML)).toBe(ARTICLE_HTML);
  });

  test('decryptArticleInPlace restores the article content and title', async () => {
    await createKeystore(PASSPHRASE);
    const jwe = extractJWE(await encryptArticlePayload(ARTICLE_HTML));
    const article = injectEncryptedArticle(jwe);

    await decryptArticleInPlace();

    expect(article.hasAttribute('data-encrypted')).toBe(false);
    expect(article.textContent).toContain('Top secret content.');
    expect(document.title).toBe('Secret Title');
    expect(Config.User.Encryption.Enabled).toBe(true);
    expect(Config.User.Encryption.Document).toBe(true);
    expect(Config.User.Encryption.DocumentEncrypt).toBe(true);
    expect(Config.User.Encryption.KeyId).toBe(getSessionKid());
  });

  test('decryptArticleInPlace is a no-op while locked', async () => {
    await createKeystore(PASSPHRASE);
    const jwe = extractJWE(await encryptArticlePayload(ARTICLE_HTML));
    const article = injectEncryptedArticle(jwe);
    lockKeystore();

    await decryptArticleInPlace();

    expect(article.hasAttribute('data-encrypted')).toBe(true);
    expect(article.textContent).not.toContain('Top secret content.');
  });

  test('content encrypted before a lock is decryptable after unlocking on a fresh session', async () => {
    await createKeystore(PASSPHRASE);
    const jwe = extractJWE(await encryptArticlePayload(ARTICLE_HTML));
    lockKeystore();

    await unlockKeystore(PASSPHRASE);
    const article = injectEncryptedArticle(jwe);

    await decryptArticleInPlace();

    expect(article.textContent).toContain('Top secret content.');
  });
});
