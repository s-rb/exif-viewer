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
    
    const parseBlobAndShow = (blob) => {
      return exifr.parse(blob, {
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
        sanitize: true,
        mergeOutput: true
      })
        .then(data => {
          if (data && Object.keys(data).length > 0) {
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
    };

    // Для file:// загружаем через background (CORS блокирует fetch из контент-скрипта)
    if (img.src.startsWith('file://')) {
      chrome.runtime.sendMessage({ action: 'fetchImage', url: img.src }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[EXIF Viewer]', chrome.runtime.lastError.message);
          createTooltip({ "Error": chrome.i18n.getMessage("errorAccessImageMsg") }, img);
          return;
        }
        if (!response || !response.success || !response.data) {
          createTooltip({ "Error": response?.error || chrome.i18n.getMessage("errorAccessImageMsg") }, img);
          return;
        }
        // Данные приходят в base64 (только первые ~512 KB файла, достаточно для EXIF)
        // Декодируем и создаем Blob - exifr поддерживает Blob
        const binary = atob(response.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const mime = (img.src.match(/\.(jpe?g|png|webp|tiff?|heic)/i) || [])[1];
        const type = mime ? (mime.toLowerCase() === 'jpg' ? 'image/jpeg' : `image/${mime}`) : 'image/jpeg';
        const blob = new Blob([bytes], { type });
        parseBlobAndShow(blob);
      });
      return;
    }

    fetch(img.src, {
      mode: 'cors',
      credentials: 'same-origin'
    })
      .then(response => response.blob())
      .then(parseBlobAndShow)
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

// Форматирование для Instagram
function formatForInstagram(data) {
  const parts = [];
  
  // Камера (если есть)
  if (data.Make || data.Model) {
    let camera = '';
    const make = (data.Make || '').trim();
    const model = (data.Model || '').trim();
    
    // Проверяем, не содержит ли Model уже название производителя
    if (model && make) {
      // Если Model начинается с Make (без учета регистра), используем только Model
      if (model.toLowerCase().startsWith(make.toLowerCase())) {
        camera = model;
      } else {
        camera = `${make} ${model}`;
      }
    } else if (model) {
      camera = model;
    } else if (make) {
      camera = make;
    }
    
    if (camera) {
      parts.push(`📷 ${camera}`);
    }
  }
  
  // Объектив (если есть)
  const lensModel = data.LensModel || data.Lens || null;
  if (lensModel) {
    parts.push(`🔎 ${lensModel}`);
  }
  
  // Параметры съемки
  const params = [];
  
  // Фокусное расстояние
  if (data.FocalLength) {
    const focal = typeof data.FocalLength === 'string' ? parseFloat(data.FocalLength) : data.FocalLength;
    if (!isNaN(focal)) {
      params.push(`${Math.round(focal)}mm`);
    }
  }
  
  // Диафрагма
  if (data.FNumber) {
    const fNumber = typeof data.FNumber === 'string' ? parseFloat(data.FNumber) : data.FNumber;
    if (!isNaN(fNumber)) {
      params.push(`f/${fNumber.toFixed(1)}`);
    }
  }
  
  // Выдержка
  if (data.ExposureTime) {
    let exposure = typeof data.ExposureTime === 'string' ? parseFloat(data.ExposureTime) : data.ExposureTime;
    if (!isNaN(exposure)) {
      // Обработка логарифмического значения
      if (exposure < 0) {
        exposure = Math.pow(2, -exposure);
      }
      
      if (exposure >= 1) {
        params.push(`${exposure.toFixed(1)}s`);
      } else {
        const fraction = 1 / exposure;
        params.push(`1/${Math.round(fraction)}s`);
      }
    }
  }
  
  // ISO
  const iso = data.ISOSpeedRatings || data.ISO || data.ISOValue || 
              data.StandardOutputSensitivity || data.RecommendedExposureIndex || 
              data.ISOSpeed || null;
  if (iso) {
    params.push(`ISO ${iso}`);
  }
  
  if (params.length > 0) {
    parts.push(`⚙️ ${params.join(' | ')}`);
  }
  
  // Локация (если есть GPS)
  const gpsLat = data.GPSLatitude || null;
  const gpsLon = data.GPSLongitude || null;
  if (gpsLat !== null && gpsLat !== undefined && 
      gpsLon !== null && gpsLon !== undefined) {
    const lat = typeof gpsLat === 'string' ? parseFloat(gpsLat) : gpsLat;
    const lon = typeof gpsLon === 'string' ? parseFloat(gpsLon) : gpsLon;
    if (!isNaN(lat) && !isNaN(lon)) {
      parts.push(`📍 Location: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    }
  }
  
  // Дата съемки (опционально)
  const dateTime = data.DateTimeOriginal || data.DateTime || data.CreateDate;
  if (dateTime) {
    let date;
    if (dateTime instanceof Date) {
      date = dateTime;
    } else if (typeof dateTime === 'string') {
      date = new Date(dateTime);
    }
    
    if (date && !isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      parts.push(`📅 ${year}-${month}-${day} ${hours}:${minutes}`);
    }
  }
  
  return parts.join('\n');
}

// Локализованные функции форматирования
function formatExposureProgramLocalized(value) {
  if (value === null || value === undefined) return null;
  const programMap = {
    0: chrome.i18n.getMessage("exposureProgramManual"),
    1: chrome.i18n.getMessage("exposureProgramProgram"),
    2: chrome.i18n.getMessage("exposureProgramAperture"),
    3: chrome.i18n.getMessage("exposureProgramShutter"),
    4: chrome.i18n.getMessage("exposureProgramProgram"),
    5: chrome.i18n.getMessage("exposureProgramProgram"),
    6: chrome.i18n.getMessage("exposureProgramProgram"),
    7: chrome.i18n.getMessage("exposureProgramProgram"),
    8: chrome.i18n.getMessage("exposureProgramManual")
  };
  if (typeof value === 'number' && programMap[value]) {
    return programMap[value];
  }
  return String(value);
}

function formatWhiteBalanceLocalized(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('daylight') || lower.includes('дневной')) {
      return chrome.i18n.getMessage("whiteBalanceDaylight");
    }
    return value;
  }
  if (typeof value === 'number') {
    return value === 0 ? chrome.i18n.getMessage("whiteBalanceAuto") : chrome.i18n.getMessage("whiteBalanceManual");
  }
  return String(value);
}

function formatFlashLocalized(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && value !== null) {
    const fired = value.fired !== undefined ? value.fired : false;
    return fired ? chrome.i18n.getMessage("flashFired") : chrome.i18n.getMessage("flashNotFired");
  }
  if (typeof value === 'number') {
    return value === 0 ? chrome.i18n.getMessage("flashNotFired") : chrome.i18n.getMessage("flashFired");
  }
  return String(value);
}

function formatDateTimeFull(value) {
  if (value === null || value === undefined) return null;
  
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    date = new Date(value);
    if (isNaN(date.getTime())) {
      return value;
    }
  } else {
    return String(value);
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Форматирование всех EXIF данных для копирования
function formatAllExifData(data) {
  const lines = [];
  lines.push(chrome.i18n.getMessage("exifDataTitle"));
  lines.push('');
  
  // Получаем название камеры без дублирования производителя
  let cameraName = '';
  const make = (data.Make || '').trim();
  const model = (data.Model || '').trim();
  if (model && make) {
    if (model.toLowerCase().startsWith(make.toLowerCase())) {
      cameraName = model;
    } else {
      cameraName = `${make} ${model}`;
    }
  } else if (model) {
    cameraName = model;
  } else if (make) {
    cameraName = make;
  }
  
  // Основные данные
  if (cameraName) {
    lines.push(`${chrome.i18n.getMessage("camera")}: ${cameraName}`);
  }
  
  const lensModel = data.LensModel || data.Lens || null;
  const hasLensMake = data.LensMake && data.LensMake.trim() !== '';
  if (lensModel) {
    const lensFull = hasLensMake && lensModel ? `${data.LensMake} ${lensModel}` : lensModel;
    lines.push(`${chrome.i18n.getMessage("lens")}: ${lensFull}`);
  }
  
  const aperture = formatFNumber(data.FNumber || data.ApertureValue);
  if (aperture) {
    lines.push(`${chrome.i18n.getMessage("aperture")}: ${aperture}`);
  }
  
  const shutterSpeed = formatExposureTime(data.ExposureTime || data.ShutterSpeedValue);
  if (shutterSpeed) {
    lines.push(`${chrome.i18n.getMessage("shutterSpeed")}: ${shutterSpeed}`);
  }
  
  const iso = data.ISOSpeedRatings || data.ISO || data.ISOValue || 
              data.StandardOutputSensitivity || data.RecommendedExposureIndex || 
              data.ISOSpeed || null;
  if (iso) {
    lines.push(`${chrome.i18n.getMessage("iso")}: ${iso}`);
  }
  
  const focalLength = formatFocalLength(data.FocalLength);
  if (focalLength) {
    lines.push(`${chrome.i18n.getMessage("focalLength")}: ${focalLength}`);
  }
  
  const dateTime = formatDateTimeFull(data.DateTimeOriginal || data.DateTime || data.CreateDate);
  if (dateTime) {
    lines.push(`${chrome.i18n.getMessage("dateTaken")}: ${dateTime}`);
  }
  
  const gpsLat = data.GPSLatitude || null;
  const gpsLon = data.GPSLongitude || null;
  if (gpsLat !== null && gpsLat !== undefined && 
      gpsLon !== null && gpsLon !== undefined) {
    const lat = typeof gpsLat === 'string' ? parseFloat(gpsLat) : gpsLat;
    const lon = typeof gpsLon === 'string' ? parseFloat(gpsLon) : gpsLon;
    if (!isNaN(lat) && !isNaN(lon)) {
      lines.push(`${chrome.i18n.getMessage("coordinates")}: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    }
  }
  
  const exposureProgram = formatExposureProgramLocalized(data.ExposureProgram);
  if (exposureProgram) {
    lines.push(`${chrome.i18n.getMessage("exposureProgram")}: ${exposureProgram}`);
  }
  
  const whiteBalance = formatWhiteBalanceLocalized(data.WhiteBalance || data.WhiteBalanceMode);
  if (whiteBalance) {
    lines.push(`${chrome.i18n.getMessage("whiteBalance")}: ${whiteBalance}`);
  }
  
  const flash = formatFlashLocalized(data.Flash);
  if (flash) {
    lines.push(`${chrome.i18n.getMessage("flash")}: ${flash}`);
  }
  
  if (data.Artist) {
    lines.push(`${chrome.i18n.getMessage("artist")}: ${data.Artist}`);
  }
  
  if (data.Copyright) {
    lines.push(`${chrome.i18n.getMessage("copyright")}: ${data.Copyright}`);
  }
  
  // Технические детали
  lines.push('');
  lines.push(chrome.i18n.getMessage("technicalDetails"));
  
  const imageWidth = data.ImageWidth || data.ExifImageWidth || data.PixelXDimension || null;
  const imageHeight = data.ImageHeight || data.ExifImageHeight || data.PixelYDimension || null;
  if (imageWidth && imageHeight) {
    lines.push(`${chrome.i18n.getMessage("imageSize")}: ${imageWidth}×${imageHeight}`);
  }
  
  if (data.Orientation) {
    const orientationMap = {
      1: chrome.i18n.getUILanguage().startsWith('ru') ? 'Горизонтальная' : 'Horizontal',
      3: chrome.i18n.getUILanguage().startsWith('ru') ? 'Перевернутая' : 'Rotated 180°',
      6: chrome.i18n.getUILanguage().startsWith('ru') ? 'Повернута на 90° по часовой' : 'Rotated 90° CW',
      8: chrome.i18n.getUILanguage().startsWith('ru') ? 'Повернута на 90° против часовой' : 'Rotated 90° CCW'
    };
    const orientation = orientationMap[data.Orientation] || String(data.Orientation);
    lines.push(`${chrome.i18n.getMessage("orientation")}: ${orientation}`);
  }
  
  if (data.ColorSpace) {
    const colorSpaceMap = {
      1: 'sRGB',
      65535: 'Uncalibrated'
    };
    const colorSpace = colorSpaceMap[data.ColorSpace] || String(data.ColorSpace);
    lines.push(`${chrome.i18n.getMessage("colorSpace")}: ${colorSpace}`);
  }
  
  if (data.Compression) {
    const compressionMap = {
      1: 'Uncompressed',
      6: 'JPEG'
    };
    const compression = compressionMap[data.Compression] || String(data.Compression);
    lines.push(`${chrome.i18n.getMessage("compression")}: ${compression}`);
  }
  
  const exposureCompensation = formatExposureCompensation(data.ExposureCompensation || data.ExposureBiasValue);
  if (exposureCompensation) {
    lines.push(`${chrome.i18n.getMessage("exposureCompensation")}: ${exposureCompensation}`);
  }
  
  const meteringMode = formatMeteringMode(data.MeteringMode);
  if (meteringMode) {
    lines.push(`${chrome.i18n.getMessage("meteringMode")}: ${meteringMode}`);
  }
  
  if (data.ImageStabilization) {
    const stabilization = data.ImageStabilization === 'On' || data.ImageStabilization === 1 ? 
      (chrome.i18n.getUILanguage().startsWith('ru') ? 'Включена' : 'On') : 
      (chrome.i18n.getUILanguage().startsWith('ru') ? 'Выключена' : 'Off');
    lines.push(`${chrome.i18n.getMessage("imageStabilization")}: ${stabilization}`);
  }
  
  if (data.GPSAltitude) {
    const altitude = typeof data.GPSAltitude === 'string' ? parseFloat(data.GPSAltitude) : data.GPSAltitude;
    if (!isNaN(altitude)) {
      lines.push(`${chrome.i18n.getMessage("gpsAltitude")}: ${altitude.toFixed(1)}m`);
    }
  }
  
  if (data.VideoFrameRate || data.FrameRate) {
    lines.push(`${chrome.i18n.getMessage("videoFrameRate")}: ${data.VideoFrameRate || data.FrameRate}`);
  }
  
  if (data.HDR || data.HDRMode || data.CustomRendered) {
    const hdrValue = data.HDR || data.HDRMode || data.CustomRendered;
    const hdr = (hdrValue === 'On' || hdrValue === 1 || hdrValue === 2 || hdrValue === 3) ? 
      (chrome.i18n.getUILanguage().startsWith('ru') ? 'Включен' : 'On') : 
      (chrome.i18n.getUILanguage().startsWith('ru') ? 'Выключен' : 'Off');
    lines.push(`${chrome.i18n.getMessage("hdr")}: ${hdr}`);
  }
  
  return lines.join('\n');
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
    <div class="exif-tooltip-more-container">
      ${hasMoreData ? `
              <button class="exif-tooltip-more-btn" data-more-btn>${chrome.i18n.getMessage("showMore")}</button>
            ` : ''}
      <button class="exif-tooltip-instagram-btn" data-instagram-btn title="Скопировать для Instagram">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      </button>
    </div>
    ${hasMoreData ? `
      <div class="exif-tooltip-more" style="display: none;">
        ${moreDataHTML}
        <div class="exif-tooltip-copy-all-container">
          <button class="exif-tooltip-copy-all-btn" data-copy-all-btn title="Скопировать все данные">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
          </button>
        </div>
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

  // Обработчик кнопки Instagram
  const instagramBtn = tooltip.querySelector('[data-instagram-btn]');
  let instagramPreview = null;
  if (instagramBtn) {
    // Обработчик наведения для превью
    instagramBtn.addEventListener('mouseenter', () => {
      const instagramText = formatForInstagram(data);
      if (instagramText) {
        instagramPreview = createPreviewTooltip(instagramText, instagramBtn);
      }
    });

    instagramBtn.addEventListener('mouseleave', () => {
      if (instagramPreview) {
        instagramPreview.style.opacity = '0';
        setTimeout(() => {
          if (instagramPreview && instagramPreview.parentNode) {
            instagramPreview.remove();
          }
          instagramPreview = null;
        }, 200);
      }
    });

    instagramBtn.addEventListener('click', async () => {
      try {
        const instagramText = formatForInstagram(data);
        if (instagramText) {
          await navigator.clipboard.writeText(instagramText);
          // Визуальная обратная связь
          const originalHTML = instagramBtn.innerHTML;
          instagramBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>';
          instagramBtn.style.color = '#4ade80';
          setTimeout(() => {
            instagramBtn.innerHTML = originalHTML;
            instagramBtn.style.color = '';
          }, 2000);
        }
      } catch (error) {
        console.error('[EXIF Viewer] Error copying to clipboard:', error);
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea');
        textArea.value = formatForInstagram(data);
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          const originalHTML = instagramBtn.innerHTML;
          instagramBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>';
          instagramBtn.style.color = '#4ade80';
          setTimeout(() => {
            instagramBtn.innerHTML = originalHTML;
            instagramBtn.style.color = '';
          }, 2000);
        } catch (err) {
          console.error('[EXIF Viewer] Fallback copy failed:', err);
        }
        document.body.removeChild(textArea);
      }
    });
  }

  // Обработчик кнопки копирования всех данных
  const copyAllBtn = tooltip.querySelector('[data-copy-all-btn]');
  let copyAllPreview = null;
  if (copyAllBtn) {
    // Обработчик наведения для превью
    copyAllBtn.addEventListener('mouseenter', () => {
      const allDataText = formatAllExifData(data);
      if (allDataText) {
        copyAllPreview = createPreviewTooltip(allDataText, copyAllBtn);
      }
    });

    copyAllBtn.addEventListener('mouseleave', () => {
      if (copyAllPreview) {
        copyAllPreview.style.opacity = '0';
        setTimeout(() => {
          if (copyAllPreview && copyAllPreview.parentNode) {
            copyAllPreview.remove();
          }
          copyAllPreview = null;
        }, 200);
      }
    });

    copyAllBtn.addEventListener('click', async () => {
      try {
        const allDataText = formatAllExifData(data);
        if (allDataText) {
          await navigator.clipboard.writeText(allDataText);
          // Визуальная обратная связь
          const originalHTML = copyAllBtn.innerHTML;
          copyAllBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>';
          copyAllBtn.style.color = '#4ade80';
          setTimeout(() => {
            copyAllBtn.innerHTML = originalHTML;
            copyAllBtn.style.color = '';
          }, 2000);
        }
      } catch (error) {
        console.error('[EXIF Viewer] Error copying to clipboard:', error);
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea');
        textArea.value = formatAllExifData(data);
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          const originalHTML = copyAllBtn.innerHTML;
          copyAllBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>';
          copyAllBtn.style.color = '#4ade80';
          setTimeout(() => {
            copyAllBtn.innerHTML = originalHTML;
            copyAllBtn.style.color = '';
          }, 2000);
        } catch (err) {
          console.error('[EXIF Viewer] Fallback copy failed:', err);
        }
        document.body.removeChild(textArea);
      }
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

// Создание превью тултипа для кнопок копирования
function createPreviewTooltip(text, button) {
  // Удаляем существующий превью, если есть
  const existingPreview = document.querySelector('.exif-preview-tooltip');
  if (existingPreview) {
    existingPreview.remove();
  }

  const preview = document.createElement('div');
  preview.className = 'exif-preview-tooltip';
  preview.style.opacity = '0';
  
  // Форматируем текст для отображения (сохраняем переносы строк)
  const formattedText = text.split('\n').map(line => {
    if (line.trim() === '') return '<br>';
    return `<div class="exif-preview-line">${escapeHtml(line)}</div>`;
  }).join('');

  preview.innerHTML = `
    <div class="exif-tooltip-header">
      <div class="exif-tooltip-model">Preview</div>
    </div>
    <div class="exif-preview-content">
      ${formattedText}
    </div>
  `;

  document.body.appendChild(preview);

  // Получаем размеры после добавления в DOM
  const previewRect = preview.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const padding = 10;
  const gap = 8;

  // Проверяем, есть ли место справа
  const spaceRight = window.innerWidth - buttonRect.right;
  const spaceLeft = buttonRect.left;
  const previewWidth = previewRect.width;

  let left, top;

  if (spaceRight >= previewWidth + gap + padding) {
    // Размещаем справа
    left = buttonRect.right + gap;
    top = buttonRect.top;
  } else if (spaceLeft >= previewWidth + gap + padding) {
    // Размещаем слева
    left = buttonRect.left - previewWidth - gap;
    top = buttonRect.top;
  } else {
    // Если места нет ни справа, ни слева, размещаем там, где больше места
    if (spaceRight > spaceLeft) {
      left = buttonRect.right + gap;
      top = buttonRect.top;
    } else {
      left = buttonRect.left - previewWidth - gap;
      top = buttonRect.top;
    }
  }

  // Убеждаемся, что тултип не выходит за границы экрана
  if (left + previewWidth > window.innerWidth - padding) {
    left = window.innerWidth - previewWidth - padding;
  }
  if (left < padding) {
    left = padding;
  }
  if (top + previewRect.height > window.innerHeight - padding) {
    top = window.innerHeight - previewRect.height - padding;
  }
  if (top < padding) {
    top = padding;
  }

  preview.style.left = left + 'px';
  preview.style.top = top + 'px';

  // Плавное появление
  requestAnimationFrame(() => {
    preview.style.transition = 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
    preview.style.opacity = '1';
  });

  return preview;
}

// Функция для экранирования HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}