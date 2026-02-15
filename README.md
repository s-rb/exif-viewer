# EXIF Data Viewer

<a href="https://buymeacoffee.com/surkoff" target="_blank"><img src="buy_me_a_coffee_40.png" alt="Buy Me A Coffee" height="40"></a>

A Chrome browser extension that allows you to view EXIF metadata from images directly in your browser.

English | [Русский](README_RUS.md)

![demo-image](./exif-viewer-demo.gif)

## Features

- **Easy to use**: Simply right-click on any image and select "View EXIF Data"
- **Basic and Advanced views**: View essential EXIF information by default, with an option to expand for detailed metadata
- **Privacy-focused**: All processing happens locally in your browser. No data is collected or transmitted
- **Works on most sites**: Compatible with the vast majority of websites
- **Lightweight**: Minimal performance impact

> **Important**: Some websites show preview or heavily optimized copies of images (for example, resized thumbnails, WebP/AVIF conversions, CDN‑compressed versions). In such cases, EXIF data may be removed or available only in the original file. See the sections **“Limitations”** and **“Working with previews and optimized images”** below.

## Overview

EXIF Data Viewer is a Chrome extension that lets you inspect EXIF photo metadata directly in your browser with a single right‑click. See which camera and lens were used, the exact shooting settings, location and more – without downloading images or leaving the page.

### Why use EXIF Data Viewer?

- **One‑click workflow**: Right‑click any image and choose “View EXIF Data” – the metadata appears in a clean, readable panel next to the picture.
- **Photographer‑friendly output**: Camera and lens model, aperture, shutter speed, ISO, focal length, shooting date, GPS coordinates and other technical details are grouped and formatted the way photographers actually read them.
- **Perfect for social media & blogging**: Instantly generate a nicely formatted block with key settings for posts (e.g. Instagram) and copy it to the clipboard.
- **Privacy‑first by design**: The extension never uploads your photos or metadata anywhere. All parsing happens locally in your browser.
- **Works on most websites**: Supports regular `<img>` tags and local files opened in the browser.

### Key features

- Basic and advanced views for EXIF data in a compact tooltip
- Camera, lens and exposure parameters (aperture, shutter speed, ISO, focal length)
- Shooting date and time in a human‑friendly format
- GPS coordinates with a quick link to open the location in Google Maps (when available)
- Copy‑ready formatted block for Instagram and other platforms
- Detailed technical section for advanced users
- Support for many EXIF variations produced by different camera manufacturers

### Limitations

Like any EXIF viewer, this extension depends on what the website actually serves:

- **No EXIF in the file – no data to show**: If the image has had its metadata stripped (for privacy, compression or CDN optimization), EXIF simply does not exist and cannot be recovered.
- **Preview / optimized images**: Many sites deliver a small preview or a recompressed WebP/AVIF version instead of the original photo. These copies often have EXIF removed, even if the original file still contains it.
- **Non‑`<img>` content**: Images drawn on `<canvas>`, used only as CSS backgrounds, or embedded into complex viewers may not be accessible as regular image URLs, which limits what the extension can read.

In these cases the extension will show a “No EXIF data found” or similar message – this is expected behavior and means the page does not expose EXIF metadata for that particular image.

### Working with previews and optimized images

If you clicked on a preview/thumbnail and EXIF data was not displayed, try the following steps:

1. **Open the original image**  
   - Look for buttons or links like “Open original”, “View full size”, “Download”, or an icon that opens the image in a separate tab.  
   - On many galleries and blogs, clicking the image once or twice opens a larger/original version.

2. **Use the extension on the full‑size image**  
   - Once the original image is opened in its own tab or in a full‑screen viewer, right‑click directly on that image.  
   - Select **“View EXIF Data”** in the context menu again.

3. **If EXIF still does not appear**  
   - The website most likely strips metadata or serves only recompressed copies without EXIF.  
   - In this case EXIF data is not technically available to any browser extension.

4. **Alternative: work with the file locally**  
   - Download the photo to your computer.  
   - Drag it into a new browser tab (or open it via `File → Open` in your browser).  
   - Right‑click the image in that tab and choose **“View EXIF Data”** – the extension will read EXIF directly from the local file, if it exists there.

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory
5. The extension is now installed and ready to use

## Usage

1. Navigate to any webpage with images
2. Right-click on an image you want to inspect
3. Select "View EXIF Data" from the context menu
4. A popup will display the basic EXIF information
5. Click "Show more" to view additional detailed metadata

## What is EXIF?

EXIF (Exchangeable Image File Format) is a standard that specifies the formats for images, sound, and ancillary tags used by digital cameras, scanners, and other systems handling image and sound files. EXIF data can include:

- Camera settings (ISO, aperture, shutter speed)
- Date and time the photo was taken
- GPS coordinates (if location services were enabled)
- Camera make and model
- Software used to edit the image
- And much more

## Privacy

This extension respects your privacy:
- All EXIF data processing happens locally in your browser
- No data is sent to external servers
- No personal information is collected
- No tracking or analytics

## Technical Details

- **Manifest Version**: 3
- **Library**: Uses [exifr](https://mutiny.cz/exifr/) for EXIF data parsing
- **Permissions**: 
  - `activeTab`: To access the current tab
  - `contextMenus`: To add the right-click menu option
  - `scripting`: To inject content scripts

## Development

This extension is built with:
- Vanilla JavaScript
- Chrome Extension Manifest V3
- exifr library for EXIF parsing

## Dependencies

This extension uses the following open-source library:

- **[exifr](https://github.com/MikeKovarik/exifr)** - MIT License
  - Used for parsing EXIF metadata from images
  - Repository: https://github.com/MikeKovarik/exifr
  - Website: https://mutiny.cz/exifr/

For full license information of third-party dependencies, see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions, issues, and feature requests are welcome!

## Support

If you encounter any issues or have questions, please open an issue on the repository.

---

**Note**: EXIF data is only available for images that contain it. Many images on the web may have had their EXIF data stripped for privacy or file size reasons.

