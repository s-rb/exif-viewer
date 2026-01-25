# EXIF Data Viewer

A Chrome browser extension that allows you to view EXIF metadata from images directly in your browser.

[Русский](README_RUS.md) | English

## Features

- **Easy to use**: Simply right-click on any image and select "View EXIF Data"
- **Basic and Advanced views**: View essential EXIF information by default, with an option to expand for detailed metadata
- **Privacy-focused**: All processing happens locally in your browser. No data is collected or transmitted
- **Works everywhere**: Compatible with all websites and local files
- **Lightweight**: Minimal performance impact

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

