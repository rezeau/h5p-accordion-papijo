# H5P.AccordionPapiJo

H5P.AccordionPapiJo is a PapiJo variant of the official H5P Accordion content type. It is based on the upstream work by Joubel and retains the familiar single-open-panel Accordion behavior while adding PapiJo-specific authoring and navigation features.

The current release-preparation version is 1.2.0.

## Compact panel navigation

Compact navigation is enabled when an Accordion has at least two panels and `accordionTitle` is non-empty. The value of `accordionTitle` is displayed as the Accordion title and disclosure control. Selecting a compact label displays its panel content directly below the navigation without repeating the traditional large panel heading. Unselected labels have a right-pointing chevron as an opening cue; the selected label is highlighted and has no chevron.

Leaving `accordionTitle` empty disables compact navigation. A single-panel Accordion also uses the traditional interface.

## Child initialization after expansion

After a panel finishes expanding, AccordionPapiJo notifies that panel's child with a `resize` event. This allows children that defer initialization until visible—notably H5P.Video with YouTube sources—to initialize correctly in both traditional and compact Accordion modes. Uploaded and local video behavior is unchanged.

## Audio sizing

Full fit-to-wrapper H5P.Audio controls no longer collapse to zero height in Chromium browsers inside Accordion panels. AccordionPapiJo preserves the browser's native Audio height without hard-coding a pixel value in both traditional and compact modes.

## Allowed panel content

Newly authored panels allow exactly:

- `H5P.AdvancedTextPapiJo 1.3`
- `H5P.Image 1.1`
- `H5P.Video 1.6`
- `H5P.Audio 1.5`

`H5P.TextareaPapiJo` is no longer offered for new panel authoring.

## Content upgrade from 1.1

AccordionPapiJo 1.2.0 targets AdvancedTextPapiJo 1.3. The H5P minor version
boundary is intentional: WordPress/H5P offers existing Accordion 1.1 content a
real 1.1 -> 1.2 content upgrade. A patch update within 1.1 does not invoke that
content upgrade and cannot migrate nested children merely by changing semantics.

During the normal H5P Accordion 1.1 -> 1.2 content upgrade, the installed H5P
engine recursively upgrades nested AdvancedTextPapiJo 1.2 children to 1.3.
Child parameters retain their structure; no custom parameter migration or
Accordion `upgrades.js` is required. Children already using 1.3 remain unchanged.
Image, Video and Audio retain their existing versions and option order.

## Verification

Run `npm test`, `npm run check:syntax`, and `git diff --check`.
The suite includes runtime characterization, JSON/release metadata checks, and
upgrade-path regressions using the installed H5P eligibility method, JavaScript
recursive engine, PHP content validator and dependency resolver. The probes use
synthetic content and read library files only; they do not bootstrap WordPress,
connect to its database, or update wp-test content or installed libraries.

By default the probes read `C:/wamp64/www/wp-test/wp-content/plugins/h5p` and
`C:/wamp64/www/wp-test/wp-content/uploads/h5p/libraries`. Set `H5P_PLUGIN_ROOT`,
`H5P_LIBRARIES_ROOT`, or `H5P_PHP_BIN` to override these paths or the PHP executable.
AdvancedText 1.3 and its tooltip editor 1.2 are read from the sibling
`papi-jo-h5p-advancedtext` repository, verified against published commit
`f07b03c0457741080b198b1839bcb86ef769cafd` and tag `v1.3.0`.
Set `H5P_ADVANCEDTEXT_ROOT` to override that source path. Legacy AdvancedText 1.2
and other dependencies still use the installed library directory.
Missing prerequisites fail the regression tests instead of silently skipping them.

## Packaging

The maintainer creates and verifies `.h5p` packages manually. This repository does not provide or use an automated H5P packaging step.

## License

(The MIT License)

Copyright (c) 2015 Joubel AS
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
