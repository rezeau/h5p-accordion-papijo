# H5P.AccordionPapiJo

H5P.AccordionPapiJo is a PapiJo variant of the official H5P Accordion content type. It is based on the upstream work by Joubel and retains the familiar single-open-panel Accordion behavior while adding PapiJo-specific authoring and navigation features.

The current release-preparation version is 1.1.2.

## Compact panel navigation

Compact navigation is enabled when an Accordion has at least two panels and `accordionTitle` is non-empty. The value of `accordionTitle` is displayed as the Accordion title and disclosure control, allowing users to reveal compact panel labels and select a panel without displaying every full-size panel header.

Leaving `accordionTitle` empty disables compact navigation. A single-panel Accordion also uses the traditional interface.

## Allowed panel content

Newly authored panels allow exactly:

- `H5P.AdvancedTextPapiJo 1.2`
- `H5P.Image 1.1`
- `H5P.Video 1.6`
- `H5P.Audio 1.5`

`H5P.TextareaPapiJo` is no longer offered for new panel authoring.

## Packaging

The maintainer creates and verifies `.h5p` packages manually. This repository does not provide or use an automated H5P packaging step.

## License

(The MIT License)

Copyright (c) 2015 Joubel AS
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
