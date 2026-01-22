console.log('[EXIF Viewer] Content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showExifData") {
    let img = document.querySelector(`img[src="${request.imgSrc}"]`);
    if (!img) {
      const decodedSrc = decodeURIComponent(request.imgSrc);
      img = document.querySelector(`img[src="${decodedSrc}"]`);
    }
    if (!img) {
      const imgElements = document.getElementsByTagName('img');
      const srcEnd = request.imgSrc.split('/').pop();
      img = Array.from(imgElements).find(img => img.src.endsWith(srcEnd));
    }
    if (img) {
      showExifTooltip(img);
    } else {
      console.error('[EXIF Viewer] Image not found:', request.imgSrc);
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  console.log('[EXIF Viewer] DOM loaded, scanning for images');
  const images = document.getElementsByTagName('img');
  console.log(`[EXIF Viewer] Found ${images.length} images`);
  for (let img of images) {
    try {
      console.log('[EXIF Viewer] Found image:', img.src);
    } catch (error) {
      console.error('[EXIF Viewer] Error processing image:', error);
    }
  }
});

function showExifTooltip(img) {
  try {
    const existingTooltips = document.querySelectorAll('[id^="exif-tooltip-"]');
    existingTooltips.forEach(t => t.remove());
    fetch(img.src, {
      mode: 'cors',
      credentials: 'same-origin'
    })
      .then(response => response.blob())
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob);
        const newImg = new Image();
        newImg.onload = function() {
          EXIF.getData(this, function() {
            const data = EXIF.getAllTags(this);
            if (Object.keys(data).length > 0) {
              createTooltip(data, img);
            } else {
              createTooltip({ "Info": chrome.i18n.getMessage("infoNoExifFound") }, img);
            }
          });
        };
        newImg.onerror = function() {
          console.error('[EXIF Viewer] Error loading image');
          createTooltip({ "Error": chrome.i18n.getMessage("errorLoadingImage") }, img);
        };
        newImg.src = objectUrl;
      })
      .catch(error => {
        console.error('[EXIF Viewer] Error fetching image:', error);
        createTooltip({ "Error": chrome.i18n.getMessage("errorAccessingImage") }, img);
      });
  } catch (error) {
    console.error('[EXIF Viewer] Error showing tooltip:', error);
  }
}

function createTooltip(data, img) {
  let tooltip = document.createElement('div');
  tooltip.id = getTooltipId(img);
  // Класс 'exif-tooltip' берется из styles.css
  // 'exif-tooltip-hidden' используется для первоначального скрытия через display: none
//  tooltip.className = 'exif-tooltip exif-tooltip-hidden';
  tooltip.className = 'exif-tooltip';

  const formattedData = Object.entries(data)
    .filter(([key]) => key !== '_raw' && key !== 'Make' && key !== 'Model')
    .map(([key, value]) => {
      let label = key.replace(/([A-Z])/g, ' $1').trim();

      label = label.replace(/G P S/, 'GPS');
        return `
                    <div class="exif-tooltip-label">${label}</div>
                    <div class="exif-tooltip-value">${value}</div>
        `;
    });
  // Получаем значения Model и Make
  const modelEntry = Object.entries(data).find(([key]) => key === 'Model');
  const makeEntry = Object.entries(data).find(([key]) => key === 'Make');
  
  const modelValue = modelEntry ? modelEntry[1] : null;
  const makeValue = makeEntry ? makeEntry[1] : null;
  
  tooltip.innerHTML = `
        <div class="exif-tooltip-header">
          <div>
            ${modelValue ? `<div class="exif-tooltip-model" data-exif-model>${modelValue}</div>` : ''}
            ${makeValue ? `<div class="exif-tooltip-date" data-exif-date>${makeValue}</div>` : ''}
            ${!modelValue && !makeValue ? `<div class="exif-tooltip-model" data-exif-model>${chrome.i18n.getMessage("exifDataTitle")}</div>` : ''}
          </div>
          <div class="exif-tooltip-badge" data-exif-focal35>...</div>
          <div class="exif-close-btn">×</div>
        </div>
        <div class="exif-tooltip-grid">
            ${formattedData.length ? formattedData.join('') : chrome.i18n.getMessage("noExifData")}
        </div>
    `;
  document.body.appendChild(tooltip);
  const closeBtn = tooltip.querySelector('.exif-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => tooltip.remove());
  }
  document.addEventListener('click', function closeOutside(e) {
    if (!tooltip.contains(e.target) && e.target !== img) {
      tooltip.remove();
      document.removeEventListener('click', closeOutside);
    }
  });
  document.addEventListener('keydown', function escapeHandler(e) {
    if (e.key === 'Escape') {
      tooltip.remove();
      document.removeEventListener('keydown', escapeHandler);
    }
  });
  const rect = img.getBoundingClientRect();
  const padding = 10;
  tooltip.style.left = Math.min(
    Math.max(rect.left, padding),
    window.innerWidth - tooltip.offsetWidth - padding
  ) + 'px';
  tooltip.style.top = Math.min(
    Math.max(rect.top, padding),
    window.innerHeight - tooltip.offsetHeight - padding
  ) + 'px';
}

function getTooltipId(img) {
  return 'exif-tooltip-' + (img.src || img.dataset.id);
}