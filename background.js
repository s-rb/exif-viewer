let lastClick = { x: 0, y: 0 };

try {
  chrome.runtime.onInstalled.addListener(() => {
    try {
      chrome.contextMenus.create({
        id: "viewExif",
        title: chrome.i18n.getMessage("contextMenuName"),
        contexts: ["image"],
        documentUrlPatterns: ["*://*/*", "file:///*"]
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('[EXIF Viewer] Context menu creation error:', chrome.runtime.lastError);
        }
      });
    } catch (error) {
      console.error('[EXIF Viewer] Error creating context menu:', error);
    }
  });

  if (chrome.contextMenus) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === "viewExif") {
        lastClick = { x: info.x, y: info.y };
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["lite.umd.min.js"]
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('[EXIF Viewer] Error injecting exif.min.js:', chrome.runtime.lastError);
            return;
          }
          chrome.tabs.sendMessage(tab.id, {
            action: "showExifData",
            imgSrc: info.srcUrl,
            pageUrl: info.pageUrl
          });
        });
      }
    });
  }
} catch (error) {
  console.error('[EXIF Viewer] Background script error:', error);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getClickPosition") {
    sendResponse(lastClick);
    return false;
  }
  if (request.action === "fetchImage" && request.url && request.url.startsWith("file://")) {
    // Exifr читает только начало файла (EXIF в JPEG/HEIC — в первых ~64–384 KB).
    // Читаем только первый фрагмент, чтобы не грузить и не кодировать весь файл.
    const EXIF_HEAD_SIZE = 512 * 1024; // 512 KB достаточно для EXIF
    fetch(request.url)
      .then(response => response.body.getReader())
      .then(reader => {
        const chunks = [];
        let total = 0;
        function read() {
          return reader.read().then(({ value, done }) => {
            if (done || total >= EXIF_HEAD_SIZE) {
              const combined = new Uint8Array(total);
              let offset = 0;
              for (const c of chunks) {
                combined.set(c, offset);
                offset += c.length;
              }
              // Кодируем в base64 для надежной передачи через sendResponse
              // Используем более быстрый способ для больших массивов
              let binary = '';
              const chunkSize = 8192;
              for (let i = 0; i < combined.length; i += chunkSize) {
                const chunk = combined.subarray(i, Math.min(i + chunkSize, combined.length));
                binary += String.fromCharCode.apply(null, chunk);
              }
              sendResponse({ success: true, data: btoa(binary) });
              return;
            }
            const need = EXIF_HEAD_SIZE - total;
            if (value.length <= need) {
              chunks.push(value);
              total += value.length;
            } else {
              chunks.push(value.subarray(0, need));
              total = EXIF_HEAD_SIZE;
              reader.cancel();
            }
            if (total >= EXIF_HEAD_SIZE) {
              const combined = new Uint8Array(total);
              let offset = 0;
              for (const c of chunks) {
                combined.set(c, offset);
                offset += c.length;
              }
              // Кодируем в base64 для надежной передачи через sendResponse
              // Используем более быстрый способ для больших массивов
              let binary = '';
              const chunkSize = 8192;
              for (let i = 0; i < combined.length; i += chunkSize) {
                const chunk = combined.subarray(i, Math.min(i + chunkSize, combined.length));
                binary += String.fromCharCode.apply(null, chunk);
              }
              sendResponse({ success: true, data: btoa(binary) });
              return;
            }
            return read();
          });
        }
        return read();
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // асинхронный ответ
  }
  return false;
});