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

import { test, expect } from "./fixtures";
import { select } from "./utils";

test.only("language switching updates visible strings", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[id="document-menu"]')).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator('[id="document-menu"]');
  await expect(menu).toBeVisible();
  

  //TODO: This needs Config.Button to be restructured and have actual keys (not the parameter to getButtonHTML)
  // Object.keys(Config.Button.Menu).forEach(async (item) => {
  //   const key = Config.Button.Menu[item].key;
  //   const selector = `[data-i18n="${key}"]`;
  //   const node = await page.locator(`${selector}`);

  //   const expecteds = {
  //     'menu.close.button': 'Close',
  //     'menu.resource-save': 'Save',
  //     'menu.resource-share': 'Share'
  //   }

  //   expect(node).toContainText(expecteds[key])
  // });

  const nodeSelectorsDefaultLang = [
    { selector: '[data-i18n="menu.delete.button"]', expectedText: "Delete" },
    { selector: '[data-i18n="menu.document-info.button"]', expectedText: "Info" },
    { selector: '[data-i18n="menu.edit-enable.button"]', expectedText: "Edit" },
    { selector: '[data-i18n="menu.embed-data.button"]', expectedText: "Embed data" },
    { selector: '[data-i18n="menu.export.button"]', expectedText: "Export" },
    { selector: '[data-i18n="menu.feed.button"]', expectedText: "Feed" },
    { selector: '[data-i18n="menu.immutable.button"]', expectedText: "Immutable" },
    { selector: '[data-i18n="menu.archive.button"]', expectedText: "Archive" },
    { selector: '[data-i18n="menu.new.button"]', expectedText: "New" },
    { selector: '[data-i18n="menu.notifications.button"]', expectedText: "Notifications" },
    { selector: '[data-i18n="menu.resource-open.button"]', expectedText: "Open" },
    { selector: '[data-i18n="menu.robustify-links.button"]', expectedText: "Robustify" },
    { selector: '[data-i18n="menu.resource-save.button"]', expectedText: "Save" },
    { selector: '[data-i18n="menu.save-as.button"]', expectedText: "Save as" },
    { selector: '[data-i18n="menu.share.button"]', expectedText: "Share" },
    { selector: '[data-i18n="menu.signin.button"]', expectedText: "Sign in" },
    { selector: '[data-i18n="menu.source.button"]', expectedText: "Source" },
    { selector: '[data-i18n="menu.memento.button"]', expectedText: "Memento" },
    { selector: '[data-i18n="menu.messages.button"]', expectedText: "Messages" },
    { selector: '[data-i18n="menu.print.button"]', expectedText: "Print" },
    { selector: '[data-i18n="menu.reply.button"]', expectedText: "Reply" },
    { selector: '[data-i18n="menu.version.button"]', expectedText: "Version" },
  ];

  const nodeSelectorsEs = [
    { selector: '[data-i18n="menu.delete.button"]', expectedText: "Eliminar" },
    { selector: '[data-i18n="menu.document-info.button"]', expectedText: "Info" },
    { selector: '[data-i18n="menu.edit-enable.button"]', expectedText: "Editar" },
    { selector: '[data-i18n="menu.embed-data.button"]', expectedText: "Insertar datos" },
    { selector: '[data-i18n="menu.export.button"]', expectedText: "Exportar" },
    { selector: '[data-i18n="menu.feed.button"]', expectedText: "Feed" },
    { selector: '[data-i18n="menu.immutable.button"]', expectedText: "Inmutable" },
    { selector: '[data-i18n="menu.archive.button"]', expectedText: "Archivar" },
    { selector: '[data-i18n="menu.new.button"]', expectedText: "Nuevo" },
    { selector: '[data-i18n="menu.notifications.button"]', expectedText: "Notificaciones" },
    { selector: '[data-i18n="menu.resource-open.button"]', expectedText: "Abrir" },
    { selector: '[data-i18n="menu.robustify-links.button"]', expectedText: "Robustecer" },
    { selector: '[data-i18n="menu.resource-save.button"]', expectedText: "Guardar" },
    { selector: '[data-i18n="menu.save-as.button"]', expectedText: "Guardar como" },
    { selector: '[data-i18n="menu.share.button"]', expectedText: "Compartir" },
    { selector: '[data-i18n="menu.signin.button"]', expectedText: "Iniciar sesión" },
    { selector: '[data-i18n="menu.source.button"]', expectedText: "Fuente" },
    { selector: '[data-i18n="menu.memento.button"]', expectedText: "Memento" },
    { selector: '[data-i18n="menu.messages.button"]', expectedText: "Mensajes" },
    { selector: '[data-i18n="menu.print.button"]', expectedText: "Imprimir" },
    { selector: '[data-i18n="menu.reply.button"]', expectedText: "Responder" },
    { selector: '[data-i18n="menu.version.button"]', expectedText: "Versión" },
  ];

  const nodeSelectorsFr = [
    { selector: '[data-i18n="menu.delete.button"]', expectedText: "Supprimer" },
    { selector: '[data-i18n="menu.document-info.button"]', expectedText: "Infos" },
    { selector: '[data-i18n="menu.edit-enable.button"]', expectedText: "Modifier" },
    { selector: '[data-i18n="menu.embed-data.button"]', expectedText: "Intégrer des données" },
    { selector: '[data-i18n="menu.export.button"]', expectedText: "Exporter" },
    { selector: '[data-i18n="menu.feed.button"]', expectedText: "Flux" },
    { selector: '[data-i18n="menu.immutable.button"]', expectedText: "Immuable" },
    { selector: '[data-i18n="menu.archive.button"]', expectedText: "Archiver" },
    { selector: '[data-i18n="menu.new.button"]', expectedText: "Nouveau" },
    { selector: '[data-i18n="menu.notifications.button"]', expectedText: "Notifications" },
    { selector: '[data-i18n="menu.resource-open.button"]', expectedText: "Ouvrir" },
    { selector: '[data-i18n="menu.robustify-links.button"]', expectedText: "Renforcer" },
    { selector: '[data-i18n="menu.resource-save.button"]', expectedText: "Enregistrer" },
    { selector: '[data-i18n="menu.save-as.button"]', expectedText: "Enregistrer sous" },
    { selector: '[data-i18n="menu.share.button"]', expectedText: "Partager" },
    { selector: '[data-i18n="menu.signin.button"]', expectedText: "Se connecter" },
    { selector: '[data-i18n="menu.source.button"]', expectedText: "Source" },
    { selector: '[data-i18n="menu.memento.button"]', expectedText: "Memento" },
    { selector: '[data-i18n="menu.messages.button"]', expectedText: "Messages" },
    { selector: '[data-i18n="menu.print.button"]', expectedText: "Imprimer" },
    { selector: '[data-i18n="menu.reply.button"]', expectedText: "Répondre" },
    { selector: '[data-i18n="menu.version.button"]', expectedText: "Version" },
  ];

  // Check default language (English)
  for (const { selector, expectedText } of nodeSelectorsDefaultLang) {
    const node = page.locator(selector);
    await expect(node).toContainText(expectedText);
  }

  // Switch to Spanish
  await page.selectOption('#ui-language-select', 'es');
  for (const { selector, expectedText } of nodeSelectorsEs) {
    const node = page.locator(selector);
    await expect(node).toContainText(expectedText);
  }

  // Switch to French
  await page.selectOption('#ui-language-select', 'fr');
  for (const { selector, expectedText } of nodeSelectorsFr) {
    const node = page.locator(selector);
    await expect(node).toContainText(expectedText);
  }
});

test("aside opens up in the selected language", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  
  const shareButton = await page.locator(".resource-share");
  shareButton.click();

  const shareDialog = await page.locator("#share-resource");
  await expect(shareDialog).toBeVisible();
  await expect(shareDialog).toContainText('Copy URL to clipboard');

  await page.selectOption('#ui-language-select', 'es');
  await expect(shareDialog).toContainText('Copiar URL al portapapeles');
});

test("comment popup uses UI language for content by default", async ({ page }) => {
  await page.goto("/");
  await select(page, "#summary");
  const commentButton = page.locator('[id="editor-button-comment"]');
  await commentButton.click();
  
  await expect(page.locator("#comment-language")).toHaveValue("en-GB");

  await page.selectOption("#comment-language", "ar");

  await expect(page.locator("#comment-language")).toHaveValue("ar");
});

// TODO: Add RTL test for labels when we have Arabic in translations
test("comment popup correctly switches to Arabic and sets dir to auto", async ({ page }) => {
  await page.goto("/");
  await select(page, "#summary");
  const commentButton = page.locator('[id="editor-button-comment"]');
  await commentButton.click();
  await expect(page.locator("textarea#comment-content")).toBeVisible();

  await page.selectOption("#comment-language", "ar");

  const dir = await page.getAttribute("textarea#comment-content", "dir");
  expect(dir).toBe("auto");
});

test("preferred language from user profile is used", async ({ page, auth }) => {
  test.setTimeout(60_000);
  await auth.login();
  await page.waitForLoadState("load");

  // Wait until console shows we're logged in
  await new Promise((resolve) => {
    page.on("console", (msg) => {
      if (msg.text().includes(process.env.WEBID)) {
        resolve();
      }
    });
  });

  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

  await expect(page.locator("#ui-language-select")).toHaveValue("es");
})

test("info opens up in the selected language", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

  await page.selectOption('#ui-language-select', 'es');
  
  const shareButton = await page.locator(".resource-share");
  shareButton.click();

  const shareDialog = await page.locator("#share-resource");
  await expect(shareDialog).toBeVisible();
 
  const infoButton = await page.locator('#share-resource button[rel="rel:help"]');
  const resourceUrl = await infoButton.getAttribute('resource');
  expect(resourceUrl).toBe('https://dokie.li/es/docs#feature-share');
  await infoButton.click();
  
  await expect(shareDialog).toContainText('Acerca de Compartir');
  await page.waitForTimeout(3000);
});