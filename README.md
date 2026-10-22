# AK-47 · Fire Serpent — local mirror

This directory mirrors the publicly served static site at <https://cs2-promo.serhiidesign.com/> for local review. It includes the original HTML, CSS, JavaScript, video sequence, fonts, preloader artwork, and sticker previews.

The original website credits its design to Clutch and identifies the game assets as © Valve. This mirror does not grant a license to redistribute the site or its assets. Get permission from the relevant rights holders before making this copy public.

## Preview locally

Serve this directory with any static web server and open its root URL. For example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`. A local server is needed because browser video and manifest loading do not work reliably from `file://` URLs.
