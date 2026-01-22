/**
 * content.js
 * Этот скрипт отвечает за внедрение и отображение EXIF тултипа на веб-страницах.
 */

// 1. Создание DOM-элемента тултипа
function createTooltipElement() {
    const tooltip = document.createElement('div');
    tooltip.id = 'goose-exif-tooltip';
    // Класс 'exif-tooltip' берется из styles.css
    // 'exif-tooltip-hidden' используется для первоначального скрытия через display: none
    tooltip.className = 'exif-tooltip exif-tooltip-hidden';
    
    // Внутренняя структура тултипа (заглушка)
    tooltip.innerHTML = `
        <div class="exif-tooltip-header">
            <div>
                <div class="exif-tooltip-model" data-exif-model>...</div>
                <div class="exif-tooltip-date" data-exif-date>...</div>
            </div>
            <div class="exif-tooltip-badge" data-exif-focal35>...</div>
        </div>
        
        <div class="exif-tooltip-grid">
            <div class="exif-tooltip-label">Aperture</div>
            <div class="exif-tooltip-value" data-exif-aperture>...</div>
            
            <div class="exif-tooltip-label">Shutter Speed</div>
            <div class="exif-tooltip-value" data-exif-shutter>...</div>
            
            <div class="exif-tooltip-label">ISO</div>
            <div class="exif-tooltip-value" data-exif-iso>...</div>
            
            <div class="exif-tooltip-label">Focal Length</div>
            <div class="exif-tooltip-value" data-exif-focal>...</div>
            
            <div class="exif-tooltip-label">Software</div>
            <div class="exif-tooltip-value" data-exif-software>...</div>
        </div>
    `;
    
    document.body.appendChild(tooltip);
    return tooltip;
}

const tooltip = createTooltipElement();
let activeImage = null; // Текущее изображение, на котором мышь

/**
 * Вспомогательная функция для позиционирования тултипа
 * @param {MouseEvent} e - Событие мыши
 */
function positionTooltip(e) {
    // 20px отступ от курсора по вертикали, чтобы тултип не перекрывал курсор
    const offset = 20; 
    const tooltipRect = tooltip.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY + offset;
    
    // Центрирование тултипа относительно курсора (за счет transform: translateX(-50%))
    // Проверка, не выходит ли тултип за правый край
    if (x + tooltipRect.width / 2 > window.innerWidth - 10) {
        x = window.innerWidth - tooltipRect.width / 2 - 10;
    }
    // Проверка, не выходит ли тултип за левый край
    else if (x - tooltipRect.width / 2 < 10) {
        x = tooltipRect.width / 2 + 10;
    }
    
    // Проверка, не выходит ли тултип за нижний край
    if (y + tooltipRect.height > window.innerHeight - 10) {
        // Если выходит, перемещаем тултип над курсором
        y = e.clientY - tooltipRect.height - 10; 
        
        // Тут нужно бы инвертировать стрелку, но оставим пока как есть для простоты
    }
    
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

/**
 * Функция для обновления данных в тултипе
 * @param {object} exifData - Объект с данными EXIF
 */
function updateTooltipData(exifData) {
    const mockData = {}; // Теперь не нужны
    
    // Helper для безопасного получения данных
    const getData = (key) => exifData[key] || mockData[key] || 'N/A';
    
    tooltip.querySelector('[data-exif-model]').textContent = getData('Model');
    tooltip.querySelector('[data-exif-date]').textContent = getData('DateTimeOriginal');
    tooltip.querySelector('[data-exif-focal35]').textContent = getData('FocalLengthIn35mmFormat');
    
    tooltip.querySelector('[data-exif-aperture]').textContent = getData('FNumber');
    tooltip.querySelector('[data-exif-shutter]').textContent = getData('ExposureTime');
    tooltip.querySelector('[data-exif-iso]').textContent = getData('ISOSpeedRatings');
    tooltip.querySelector('[data-exif-focal]').textContent = getData('FocalLength');
    tooltip.querySelector('[data-exif-software]').textContent = getData('Software');
}

/**
 * Обработчик наведения мыши
 * @param {Event} e 
 */
function handleMouseEnter(e) {
    activeImage = e.target;
    
    // Имитация задержки перед показом (как в оригинальном HTML)
    setTimeout(() => {
        if (activeImage === e.target) { // && image.src.startsWith('data:image') - Добавить проверку, что изображение не base64
            updateTooltipData({}); // Обновление с моковыми данными
            tooltip.classList.remove('exif-tooltip-hidden');
            // 'exif-tooltip-show' контролирует opacity: 1, который включен в styles.css
            tooltip.classList.add('exif-tooltip-show'); 
            positionTooltip(e);
        }
    }, 300);
}

/**
 * Обработчик движения мыши
 * @param {Event} e 
 */
function handleMouseMove(e) {
    if (activeImage === e.target && tooltip.classList.contains('exif-tooltip-show')) { 
        positionTooltip(e);
    }
}

/**
 * Обработчик ухода мыши
 */
function handleMouseLeave() {
    activeImage = null;
    tooltip.classList.add('exif-tooltip-hidden');
    tooltip.classList.remove('exif-tooltip-show');
}

// --- ЛОГИКА ЧТЕНИЯ EXIF ИЗ BACKGROUND.JS (Контекстное меню) ---

/**
 * Функция-заглушка для обработки данных EXIF
 * В реальном проекте здесь будет логика парсинга и форматирования данных.
 * @param {object} tags - Сырые EXIF данные
 * @returns {object} - Отформатированные данные
 */
function formatExifData(tags) {
    const getValue = (key, defaultValue = 'N/A') => tags[key] || defaultValue; 
    
    // Пример форматирования
    return {
        Model: getValue('Model'),
        DateTimeOriginal: getValue('DateTimeOriginal'),
        FNumber: tags.FNumber ? `f/${tags.FNumber.toFixed(1)}` : 'N/A',
        ExposureTime: tags.ExposureTime ? (tags.ExposureTime < 1 ? `1/${Math.round(1 / tags.ExposureTime)} sec` : `${tags.ExposureTime} sec`) : 'N/A',
        ISOSpeedRatings: getValue('ISOSpeedRatings'),
        FocalLength: tags.FocalLength ? `${tags.FocalLength} mm` : 'N/A',
        // FocalLengthIn35mmFormat здесь нет в сырых данных, но можем добавить
        FocalLengthIn35mmFormat: 'N/A', 
        Software: getValue('Software')
    };
}

/**
 * Обработчик сообщений от Service Worker (background.js)
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showExifData") {
        // 1. Скрыть тултип, который мог быть показан ранее по наведению
        handleMouseLeave();

        // 2. Получить координаты клика из background.js
        chrome.runtime.sendMessage({ action: "getClickPosition" }, (coords) => {
            // 3. Считать EXIF данные
            // Функция EXIF.getData() должна быть доступна, так как exif.min.js уже инжектирован
            EXIF.getData({
                target: request.imgSrc,
                callback: function() {
                    const tags = EXIF.getAllTags(this);
                    const formattedData = formatExifData(tags);

                    // 4. Отобразить тултип в месте клика
                    updateTooltipData(formattedData);
                    
                    // Имитация объекта события для positionTooltip
                    const mockEvent = { clientX: coords.x, clientY: coords.y };
                    tooltip.classList.remove('exif-tooltip-hidden');
                    tooltip.classList.add('exif-tooltip-show');
                    positionTooltip(mockEvent);
                }
            });
        });
    }
});

// 3. Найти все изображения и добавить слушатели событий
function initExifViewer() {
    // Получаем все элементы img, которые имеют ширину и высоту > 50px (для исключения мелких иконок)
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
        // Проверяем, что слушатели не были добавлены ранее (важно для SPA, где DOM может меняться)
        if (img.getAttribute('data-exif-listener-added') !== 'true') {
            img.addEventListener('mouseenter', handleMouseEnter);
            img.addEventListener('mousemove', handleMouseMove);
            img.addEventListener('mouseleave', handleMouseLeave);
            img.setAttribute('data-exif-listener-added', 'true');
        }
    });
    
    // Добавляем слушателя на document, чтобы ловить динамически добавляемые изображения
    // Используем MutationObserver для более точной работы, но пока ограничимся простой проверкой
}

// Запускаем инициализацию при загрузке страницы
initExifViewer();

// MutationObserver для динамически добавляемых элементов (например, в SPA)
const observer = new MutationObserver(initExifViewer);
observer.observe(document.body, { childList: true, subtree: true });

