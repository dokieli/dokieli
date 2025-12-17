const WebExtension = (typeof browser !== 'undefined') ? browser : chrome;

let C = {
  tabIds: [],
  WebID: null
};

async function injectResources(tabId, files) {
  for (const resource of files) {
    if (resource.endsWith('.css')) {
      await WebExtension.scripting.insertCSS({
        target: { tabId },
        files: [resource]
      });
    }
    else if (resource.endsWith('.js')) {
      await WebExtension.scripting.executeScript({
        target: { tabId },
        files: [resource]
      });
    }
    else {
      throw new Error('Unsupported resource type');
    }
  }
}

async function dokieliInit(tab) {
  try {
    await injectResources(tab.id, ['media/css/dokieli.css']);
  }
  catch (e) {
    // silent
  }
}

function showDocumentMenu(tab) {
  WebExtension.tabs.sendMessage(
    tab.id,
    { action: 'dokieli.showDocumentMenu', webid: C.WebID },
    () => {
      if (!C.tabIds.includes(tab.id)) {
        C.tabIds.push(tab.id);
      }
    }
  );
}

WebExtension.action.onClicked.addListener(async (tab) => {
  WebExtension.tabs.sendMessage(
    tab.id,
    { action: 'dokieli.status' },
    (response) => {
      if (response && !response.dokieli) {
        dokieliInit(tab);
      }
      showDocumentMenu(tab);
    }
  );
});

WebExtension.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.property === 'webid' && C.WebID) {
    sendResponse({ webid: C.WebID });
  }
  else {
    sendResponse({});
  }
  return true;
});
