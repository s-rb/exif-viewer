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
      createTooltip({ "Error": chrome.i18n.getMessage("errorLoadingImageMsg") }, img);
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
          createTooltip({ "Info": chrome.i18n.getMessage("infoNoExifFoundMsg") }, img);
        }
      })
      .catch(error => {
        console.error('[EXIF Viewer] Error parsing EXIF data:', error);
        createTooltip({ "Error": chrome.i18n.getMessage("errorAccessImageMsg") }, img);
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
    if (key === 'errors' || key === '_raw') {
      continue;
    }
    
    // Обрабатываем вложенные объекты (ifd0, exif, gps, ifd1)
    if (key === 'gps' && value && typeof value === 'object') {
      // Обрабатываем GPS данные
      if (value.latitude !== undefined && value.longitude !== undefined) {
        adapted['GPSLatitude'] = value.latitude;
        adapted['GPSLongitude'] = value.longitude;
      }
      // Копируем другие GPS поля
      for (const [gpsKey, gpsValue] of Object.entries(value)) {
        if (gpsKey !== 'latitude' && gpsKey !== 'longitude' && gpsValue !== null && gpsValue !== undefined) {
          adapted[`GPS${gpsKey.charAt(0).toUpperCase() + gpsKey.slice(1)}`] = formatValue(gpsValue);
        }
      }
    } else if ((key === 'ifd0' || key === 'exif' || key === 'ifd1') && value && typeof value === 'object') {
      // Копируем поля из вложенных объектов
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (nestedValue !== null && nestedValue !== undefined) {
          adapted[nestedKey] = formatValue(nestedValue);
        }
      }
    } else {
      // Преобразуем значения в строки, если нужно
      if (value !== null && value !== undefined) {
        adapted[key] = formatValue(value);
      }
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
  } else if (value instanceof Date) {
    // Сохраняем Date объект как есть для последующего форматирования
    return value;
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

// Функции для форматирования специфичных EXIF полей
function formatFNumber(value) {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return null;
  // Если значение очень маленькое (< 1), это может быть логарифмическое значение ApertureValue
  // ApertureValue = log2(FNumber^2), поэтому FNumber = sqrt(2^ApertureValue)
  if (num < 1 && num > 0) {
    const fNumber = Math.sqrt(Math.pow(2, num));
    return `f/${fNumber.toFixed(1)}`;
  }
  return `f/${num.toFixed(1)}`;
}

function formatExposureTime(value) {
  if (value === null || value === undefined) return null;
  let num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return null;
  
  // Если значение отрицательное, это может быть логарифмическое значение ShutterSpeedValue
  // ShutterSpeedValue = -log2(ExposureTime), поэтому ExposureTime = 2^(-ShutterSpeedValue)
  if (num < 0) {
    num = Math.pow(2, -num);
  }
  
  if (num >= 1) {
    return `${num.toFixed(1)}s`;
  } else {
    const fraction = 1 / num;
    return `1/${Math.round(fraction)}`;
  }
}

function formatFocalLength(value) {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return null;
  return `${Math.round(num)}mm`;
}

function formatExposureCompensation(value) {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return null;
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(1)} EV`;
}

function formatExposureProgram(value) {
  if (value === null || value === undefined) return null;
  const programMap = {
    0: 'Manual',
    1: 'Program',
    2: 'Aperture Priority (A/Av)',
    3: 'Shutter Priority (S/Tv)',
    4: 'Program Creative',
    5: 'Program Action',
    6: 'Portrait',
    7: 'Landscape',
    8: 'Bulb'
  };
  if (typeof value === 'number' && programMap[value]) {
    return programMap[value];
  }
  return String(value);
}

function formatMeteringMode(value) {
  if (value === null || value === undefined) return null;
  const modeMap = {
    0: 'Unknown',
    1: 'Average',
    2: 'Center-weighted average',
    3: 'Spot',
    4: 'Multi-spot',
    5: 'Multi-segment',
    6: 'Partial',
    255: 'Other'
  };
  if (typeof value === 'number' && modeMap[value]) {
    return modeMap[value];
  }
  return String(value);
}

function formatFlash(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && value !== null) {
    const fired = value.fired !== undefined ? value.fired : false;
    const mode = value.mode || 'Unknown';
    return `${fired ? 'Fired' : 'Not fired'} (${mode})`;
  }
  if (typeof value === 'number') {
    return value === 0 ? 'Not fired' : 'Fired';
  }
  return String(value);
}

function formatDateTimeOriginal(value) {
  if (value === null || value === undefined) return null;
  
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    // Парсим строку даты (может быть в формате ISO: "2024-03-06T09:15:32.000Z")
    date = new Date(value);
    if (isNaN(date.getTime())) {
      // Если не удалось распарсить, возвращаем исходное значение
      return value;
    }
  } else {
    return String(value);
  }
  
  // Форматируем в привычный формат: "06.03.2024 09:15"
  // Используем локальное время для отображения
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function formatGPSLocation(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
  const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
  const lonNum = typeof lon === 'string' ? parseFloat(lon) : lon;
  if (isNaN(latNum) || isNaN(lonNum)) return null;
  // Для отображения используем 5 знаков после запятой (точность ~1.1 метра)
  // Для ссылки используем полную точность
  return {
    text: `${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`,
    url: `https://www.google.com/maps?q=${latNum},${lonNum}`
  };
}

function createTooltip(data, img) {
  let tooltip = document.createElement('div');
  tooltip.id = getTooltipId(img);
  tooltip.className = 'exif-tooltip';

  // Извлекаем основные данные
  const make = data.Make || null;
  const model = data.Model || null;
  const camera = make && model ? `${make} ${model}` : (model || make || null);
  
  // Извлекаем ISO из разных возможных полей
  const getISO = () => {
    return data.ISOSpeedRatings || 
           data.ISO || 
           data.ISOValue || 
           data.StandardOutputSensitivity ||
           data.RecommendedExposureIndex ||
           data.ISOSpeed ||
           null;
  };

  // Формируем информацию об объективе
  // Если есть LensMake, показываем полную информацию (LensMake + LensModel) только в технических деталях
  // Если нет LensMake, но есть LensModel, показываем только LensModel в основных данных
  const hasLensMake = data.LensMake && data.LensMake.trim() !== '';
  const lensModel = data.LensModel || data.Lens || null;
  
  // Формируем полную информацию об объективе для технических деталей
  // Если есть и марка, и модель - показываем оба значения
  let lensFullInfo = null;
  if (hasLensMake && lensModel) {
    lensFullInfo = `${data.LensMake} ${lensModel}`.trim();
  } else if (hasLensMake) {
    lensFullInfo = data.LensMake;
  } else if (lensModel) {
    // Если есть только модель без марки, она будет показана в основных данных
    lensFullInfo = null;
  }

  const mainData = {
    'Lens': hasLensMake ? null : lensModel, // Показываем в основных только если нет марки
    'Aperture': formatFNumber(data.FNumber || data.ApertureValue),
    'Shutter Speed': formatExposureTime(data.ExposureTime || data.ShutterSpeedValue),
    'ISO': getISO(),
    'Focal Length': formatFocalLength(data.FocalLength),
    'Date Taken': formatDateTimeOriginal(data.DateTimeOriginal || data.DateTime || data.CreateDate)
  };

  // Извлекаем дополнительные данные по категориям
  const formatWhiteBalance = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') {
      return value === 0 ? 'Auto' : 'Manual';
    }
    return String(value);
  };

  const formatImageStabilization = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'on' || value === '1' ? 'On' : 'Off';
    }
    if (typeof value === 'number') {
      return value === 1 ? 'On' : 'Off';
    }
    return String(value);
  };

  const technicalDetails = {
    'Lens': lensFullInfo, // Показываем полную информацию об объективе в технических деталях
    'Exposure Program': formatExposureProgram(data.ExposureProgram),
    'Exposure Compensation': formatExposureCompensation(data.ExposureCompensation || data.ExposureBiasValue),
    'Metering Mode': formatMeteringMode(data.MeteringMode),
    'White Balance': formatWhiteBalance(data.WhiteBalance || data.WhiteBalanceMode),
    'Flash': formatFlash(data.Flash),
    'Image Stabilization': formatImageStabilization(data.ImageStabilization),
    'Compression': data.Compression || (data.CompressedBitsPerPixel ? `JPEG Quality: ${data.CompressedBitsPerPixel}` : null) || null
  };

  // GPS данные
  const gpsLat = data.GPSLatitude || null;
  const gpsLon = data.GPSLongitude || null;
  const gpsLocation = formatGPSLocation(gpsLat, gpsLon);
  
  // Форматируем высоту GPS - округляем до 1 знака после запятой
  const formatGPSAltitude = (value) => {
    if (value === null || value === undefined) return null;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return null;
    // Округляем до 1 знака после запятой (точность GPS-высоты ±5-10 метров)
    return `${num.toFixed(1)}m`;
  };

  const gpsAndAuthor = {
    'GPS Coordinates': gpsLocation,
    'GPS Altitude': formatGPSAltitude(data.GPSAltitude),
    'Artist': data.Artist || null,
    'Copyright': data.Copyright || null
  };

  // Видео данные
  const formatHDR = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'on' || value === '1' ? 'On' : 'Off';
    }
    if (typeof value === 'number') {
      return value === 1 || value === 2 || value === 3 ? 'On' : 'Off';
    }
    return String(value);
  };

  const videoData = {
    'Video Frame Rate': data.VideoFrameRate || data.FrameRate || null,
    'HDR': formatHDR(data.HDR || data.HDRMode || data.CustomRendered)
  };

  // Фильтруем только существующие значения
  const filterExisting = (obj) => {
    const filtered = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        filtered[key] = value;
      }
    }
    return filtered;
  };

  const mainDataFiltered = filterExisting(mainData);
  const technicalFiltered = filterExisting(technicalDetails);
  const gpsFiltered = filterExisting(gpsAndAuthor);
  const videoFiltered = filterExisting(videoData);

  // Проверяем, есть ли дополнительные данные
  const hasMoreData = Object.keys(technicalFiltered).length > 0 || 
                      Object.keys(gpsFiltered).length > 0 || 
                      Object.keys(videoFiltered).length > 0;

  // Формируем HTML для основных данных
  const mainDataHTML = Object.entries(mainDataFiltered)
    .map(([key, value]) => {
      return `
        <div class="exif-tooltip-label">${key}</div>
        <div class="exif-tooltip-value">${value}</div>
      `;
    })
    .join('');

  // Формируем HTML для дополнительных данных
  let moreDataHTML = '';
  if (hasMoreData) {
    if (Object.keys(technicalFiltered).length > 0) {
      moreDataHTML += `
        <div class="exif-tooltip-section">
          <div class="exif-tooltip-grid">
            <div class="exif-tooltip-section-title">Technical Details</div>
            ${Object.entries(technicalFiltered)
              .map(([key, value]) => `
                <div class="exif-tooltip-label">${key}</div>
                <div class="exif-tooltip-value">${value}</div>
              `)
              .join('')}
          </div>
        </div>
      `;
    }

    if (Object.keys(gpsFiltered).length > 0) {
      moreDataHTML += `
        <div class="exif-tooltip-section">
          <div class="exif-tooltip-grid">
            <div class="exif-tooltip-section-title">GPS & Copyright</div>
            ${Object.entries(gpsFiltered)
              .map(([key, value]) => {
                if (key === 'GPS Coordinates' && typeof value === 'object' && value.url) {
                  return `
                    <div class="exif-tooltip-label">${key}</div>
                    <div class="exif-tooltip-value">
                      <a href="${value.url}" target="_blank" class="exif-gps-link">${value.text} ↗</a>
                    </div>
                  `;
                }
                return `
                  <div class="exif-tooltip-label">${key}</div>
                  <div class="exif-tooltip-value">${value}</div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    if (Object.keys(videoFiltered).length > 0) {
      moreDataHTML += `
        <div class="exif-tooltip-section">
          <div class="exif-tooltip-grid">
            <div class="exif-tooltip-section-title">Video</div>
            ${Object.entries(videoFiltered)
              .map(([key, value]) => `
                <div class="exif-tooltip-label">${key}</div>
                <div class="exif-tooltip-value">${value}</div>
              `)
              .join('')}
          </div>
        </div>
      `;
    }
  }

  tooltip.innerHTML = `
    <div class="exif-tooltip-header">
      <div>
        ${model ? `<div class="exif-tooltip-model" data-exif-model>${model}</div>` : ''}
        ${make ? `<div class="exif-tooltip-make" data-exif-make>${make}</div>` : ''}
        ${!model && !make ? `<div class="exif-tooltip-model" data-exif-model>${chrome.i18n.getMessage("exifDataTooltipTitle")}</div>` : ''}
      </div>
      <div class="exif-close-btn">×</div>
    </div>
    <div class="exif-tooltip-grid">
      ${mainDataHTML || chrome.i18n.getMessage("noExifDataMsg")}
    </div>
    ${hasMoreData ? `
      <div class="exif-tooltip-more-container">
        <button class="exif-tooltip-more-btn" data-more-btn>${chrome.i18n.getMessage("showMore")}</button>
      </div>
      <div class="exif-tooltip-more" style="display: none;">
        ${moreDataHTML}
      </div>
    ` : ''}
  `;

  document.body.appendChild(tooltip);

  // Обработчики событий
  const closeBtn = tooltip.querySelector('.exif-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => tooltip.remove());
  }

  const moreBtn = tooltip.querySelector('[data-more-btn]');
  const moreSection = tooltip.querySelector('.exif-tooltip-more');
  if (moreBtn && moreSection) {
    moreBtn.addEventListener('click', () => {
      const isHidden = moreSection.style.display === 'none';
      moreSection.style.display = isHidden ? 'block' : 'none';
      moreBtn.textContent = isHidden ? chrome.i18n.getMessage("showLess") : chrome.i18n.getMessage("showMore");
    });
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

  // Позиционирование
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