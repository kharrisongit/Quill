Fixes the top of scrolling popups being cut off on iPhone.

- Keeps the revision panel and other popups below the status bar and clear of the home indicator, including after scrolling down and back to the top.
- Adjusts popup bounds for portrait and landscape safe areas.
- Contains scrolling inside the popup so reaching either end does not scroll the page behind it.
