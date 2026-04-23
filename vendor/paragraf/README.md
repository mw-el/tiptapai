# Vendored Paragraf Packages

This folder stores the packed `@paragraf/*` tarballs that TiptapAI installs via local `file:` dependencies.

Use the repo script instead of editing this folder by hand:

```bash
./install-update-paragraph.sh install
./install-update-paragraph.sh update
```

What lives where:

- `vendor/paragraf-src/`: local upstream checkout used for build and pack
- `vendor/paragraf/`: tarballs and `manifest.json` used by this app

The install/update script excludes the upstream `demo` workspace from the vendored checkout and cleans temporary build dependencies after packing.

The source checkout is intentionally ignored in git. The tarballs in this folder are meant to be the stable, reproducible inputs for the app.
