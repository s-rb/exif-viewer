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
    
    // Проверяем, доступна ли библиотека exifr
    if (typeof exifr === 'undefined') {
      console.error('[EXIF Viewer] exifr library not loaded!');
      createTooltip({ "Error": chrome.i18n.getMessage("errorLoadingImage") }, img);
      return;
    }
    
    fetch(img.src, {
      mode: 'cors',
      credentials: 'same-origin'
    })
      .then(response => response.blob())
      .then(blob => {
        // Используем exifr.parse() для парсинга EXIF данных из blob
        return exifr.parse(blob, {
          translateKeys: true,
          translateValues: true,
          reviveValues: true,
          sanitize: true,
          mergeOutput: true
        });
      })
      .then(data => {
        if (data && Object.keys(data).length > 0) {
          // Адаптируем формат данных exifr к ожидаемому формату
          const adaptedData = adaptExifrData(data);
          createTooltip(adaptedData, img);
        } else {
          createTooltip({ "Info": chrome.i18n.getMessage("infoNoExifFound") }, img);
        }
      })
      .catch(error => {
        console.error('[EXIF Viewer] Error parsing EXIF data:', error);
        createTooltip({ "Error": chrome.i18n.getMessage("errorAccessingImage") }, img);
      });
  } catch (error) {
    console.error('[EXIF Viewer] Error showing tooltip:', error);
  }
}

// Функция для адаптации данных exifr к формату, ожидаемому createTooltip
function adaptExifrData(data) {
  const adapted = {};
  
  // Копируем все свойства из данных exifr
  for (const [key, value] of Object.entries(data)) {
    // Пропускаем служебные поля
    if (key === 'errors' || key === '_raw' || key === 'ifd0' || key === 'ifd1' || key === 'exif' || key === 'gps') {
      // Обрабатываем вложенные объекты отдельно
      if (key === 'gps' && value && typeof value === 'object') {
        // Обрабатываем GPS данные
        if (value.latitude !== undefined && value.longitude !== undefined) {
          adapted['GPSLocation'] = `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`;
        }
        // Копируем другие GPS поля
        for (const [gpsKey, gpsValue] of Object.entries(value)) {
          if (gpsKey !== 'latitude' && gpsKey !== 'longitude' && gpsValue !== null && gpsValue !== undefined) {
            adapted[gpsKey] = formatValue(gpsValue);
          }
        }
      } else if ((key === 'ifd0' || key === 'exif') && value && typeof value === 'object') {
        // Копируем поля из вложенных объектов
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (nestedValue !== null && nestedValue !== undefined) {
            adapted[nestedKey] = formatValue(nestedValue);
          }
        }
      }
      continue;
    }
    
    // Преобразуем значения в строки, если нужно
    if (value !== null && value !== undefined) {
      adapted[key] = formatValue(value);
    }
  }
  
  return adapted;
}

// Вспомогательная функция для форматирования значений
function formatValue(value) {
  if (typeof value === 'string') {
    return value;
  } else if (typeof value === 'number') {
    return value.toString();
  } else if (Array.isArray(value)) {
    return value.join(', ');
  } else if (typeof value === 'object') {
    // Если это объект с latitude и longitude
    if (value.latitude !== undefined && value.longitude !== undefined) {
      return `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`;
    }
    // Иначе преобразуем в JSON строку
    return JSON.stringify(value);
  }
  return String(value);
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