'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { root, pluginRoot, advancedTextRoot, advancedTextRelease, baseline, baselineJSON, parentManifest, parentSemantics,
  eligibility, offeredUpgrade, validate } = require('../test-support/installed-h5p');

const subContentId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
function textChild(minor = 2, managedImages = false) {
  const params = {
    text: '<p><strong>Rich text</strong> &amp; accents é ' +
      '<span class="papijo-tooltip" data-papijo-tooltip="Tooltip text" ' +
      'data-papijo-tooltip-id="tip-1">Hover</span></p>',
    tooltipImages: [{ id: 'tip-1', alt: 'Tooltip image', image: {
      path: 'images/tooltip.png', mime: 'image/png', width: 80, height: 40
    } }]
  };
  if (managedImages) {
    params.text += '<p><span class="papijo-inline-image" data-papijo-inline-image-id="inline-1" ' +
      'data-papijo-inline-image-width="75" data-papijo-inline-image-style="alignLeft" ' +
      'data-papijo-inline-image-link="https://example.org/image">' +
      '<span class="papijo-image-caption">Photo caption</span></span></p>';
    params.inlineImages = [{ id: 'inline-1', alt: 'Managed image', image: {
      path: 'images/managed.png', mime: 'image/png', width: 120, height: 60
    } }];
  }
  return { library: `H5P.AdvancedTextPapiJo 1.${minor}`, params, subContentId,
    metadata: { title: 'Child title', license: 'U', authors: [{ name: 'Author', role: 'Author' }] } };
}
function accordion(children = [textChild()]) {
  return { library: 'H5P.AccordionPapiJo 1.1', params: {
    accordionTitle: 'Navigation', hTag: 'h3',
    panels: children.map((content, index) => ({ title: `Panel ${index + 1}`, content }))
  }, metadata: { title: 'Parent title', license: 'U' } };
}
const childOf = (content, index = 0) => content.params.panels[index].content;

test('release probes use the final published AdvancedText 1.3.0 and tooltip editor 1.2.0 source', () => {
  const git = (...args) => execFileSync('git', ['-C', advancedTextRoot, ...args], { encoding: 'utf8' });
  assert.equal(git('rev-parse', 'HEAD').trim(), advancedTextRelease);
  assert.equal(git('rev-parse', 'v1.3.0^{commit}').trim(), advancedTextRelease);
  for (const file of ['library.json', 'semantics.json', 'editor/library.json']) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(advancedTextRoot, file), 'utf8')),
      JSON.parse(git('show', `${advancedTextRelease}:${file}`)), `${file} must match the published source`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(advancedTextRoot, 'library.json'), 'utf8'));
  const editor = JSON.parse(fs.readFileSync(path.join(advancedTextRoot, 'editor/library.json'), 'utf8'));
  assert.deepEqual([manifest.machineName, manifest.majorVersion, manifest.minorVersion, manifest.patchVersion],
    ['H5P.AdvancedTextPapiJo', 1, 3, 0]);
  assert.deepEqual([editor.machineName, editor.majorVersion, editor.minorVersion, editor.patchVersion],
    ['H5PEditor.AdvancedTextPapiJoTooltip', 1, 2, 0]);
  assert.deepEqual(manifest.editorDependencies, [
    { machineName: 'H5PEditor.AdvancedTextPapiJoTooltip', majorVersion: 1, minorVersion: 2 }
  ]);
  assert.equal(fs.existsSync(path.join(advancedTextRoot, 'upgrades.js')), false);
});

test('installed WordPress uses core.getUpgrades; actual eligibility excludes patches and offers 1.2.0', () => {
  const admin = fs.readFileSync(path.join(pluginRoot, 'admin/class-h5p-library-admin.php'), 'utf8');
  assert.match(admin, /\$upgrades = \$core->getUpgrades\(\$version, \$versions\)/);
  assert.match(admin, /'versions' => \$upgrades/);
  assert.deepEqual(eligibility(), { 120: '1.2.0' });
  assert.deepEqual(eligibility({ ...baselineJSON('library.json'), patchVersion: 7 }), {});
});

for (const managed of [false, true]) {
  test(`real 1.1 -> 1.2 engine preserves legacy 1.2 child data before filtering (inlineImages ${managed ? 'present' : 'absent'})`, async () => {
    const before = accordion([textChild(2, managed)]);
    const result = await offeredUpgrade(before);
    assert.equal(result.invoked, true);
    assert.deepEqual(result.loads, ['H5P.AccordionPapiJo 1.2', 'H5P.AdvancedTextPapiJo 1.3']);
    assert.equal(result.content.library, 'H5P.AccordionPapiJo 1.2');
    const expected = structuredClone(before);
    expected.library = 'H5P.AccordionPapiJo 1.2';
    childOf(expected).library = 'H5P.AdvancedTextPapiJo 1.3';
    // Full equality checks parameters, rich text, tooltip and managed image stores,
    // attributes, metadata, UUID, file paths and optional field absence together.
    assert.deepEqual(result.content, expected);
    assert.equal(Object.hasOwn(childOf(result.content).params, 'inlineImages'), managed);
    const filtered = validate(result.content);
    assert.deepEqual(filtered.errors, []);
    assert.deepEqual(filtered.content, expected);
    assert.equal(Object.hasOwn(childOf(filtered.content).params, 'inlineImages'), managed);
    assert.equal(childOf(before).library, 'H5P.AdvancedTextPapiJo 1.2');
  });
}

test('installed validator preserves valid migrated content and rebuilds runtime/editor dependencies', async () => {
  const before = accordion([textChild(2, true)]);
  const result = await offeredUpgrade(before);
  const filtered = validate(result.content);
  assert.deepEqual(filtered.errors, []);
  assert.deepEqual(filtered.content, result.content);
  const deps = filtered.dependencies;
  assert.equal(deps['preloaded-H5P.AccordionPapiJo'].library, 'H5P.AccordionPapiJo 1.2');
  assert.equal(deps['preloaded-H5P.AdvancedTextPapiJo'].library, 'H5P.AdvancedTextPapiJo 1.3');
  assert.equal(deps['editor-H5PEditor.AdvancedTextPapiJoTooltip'].library, 'H5PEditor.AdvancedTextPapiJoTooltip 1.2');
  assert.equal(deps['preloaded-FontAwesome'].library, 'FontAwesome 4.5');
  assert.equal(deps['editor-H5PEditor.ShowWhen'].library, 'H5PEditor.ShowWhen 1.0');
  assert.equal(Object.keys(deps).length, 5);
  for (const [key, dependency] of Object.entries(deps)) {
    assert.equal(dependency.type, key.split('-')[0]);
    assert.ok(dependency.weight > 0);
    assert.notEqual(dependency.library, 'H5P.AdvancedTextPapiJo 1.2');
    assert.notEqual(dependency.library, 'H5PEditor.AdvancedTextPapiJoTooltip 1.1');
  }
  const legacyDeps = validate(before, { parentManifest: baselineJSON('library.json'),
    parentSemantics: baselineJSON('semantics.json') }).dependencies;
  assert.equal(legacyDeps['preloaded-H5P.AdvancedTextPapiJo'].library, 'H5P.AdvancedTextPapiJo 1.2');
  assert.equal(legacyDeps['editor-H5PEditor.AdvancedTextPapiJoTooltip'].library, 'H5PEditor.AdvancedTextPapiJoTooltip 1.1');
});

test('normal installed filtering removes unsafe HTML/unknown fields without nulling the migrated child', async () => {
  const before = accordion();
  const child = childOf(before);
  child.params.text += '<script>alert(1)</script><p onclick="evil()">Safe</p>' +
    '<a href="javascript:evil()">Link</a>';
  child.params.unknown = 'remove';
  child.unknown = 'remove';
  child.metadata.unknown = 'remove';
  child.params.tooltipImages[0].unknown = 'remove';
  child.params.tooltipImages[0].image.unknown = 'remove';
  before.params.unknown = 'remove';
  const result = await offeredUpgrade(before);
  assert.deepEqual(childOf(result.content).params, child.params, 'Upgrade precedes filtering');
  const filtered = validate(result.content);
  const after = childOf(filtered.content);
  assert.ok(after);
  assert.deepEqual(filtered.errors, []);
  assert.equal(after.library, 'H5P.AdvancedTextPapiJo 1.3');
  assert.equal(after.subContentId, subContentId);
  assert.match(after.params.text, /<strong>Rich text<\/strong>/);
  assert.match(after.params.text, /data-papijo-tooltip="Tooltip text"/);
  assert.doesNotMatch(after.params.text, /<script|onclick|javascript:/i);
  assert.equal(Object.hasOwn(after.params, 'inlineImages'), false);
  for (const value of [filtered.content.params, after, after.params, after.metadata,
    after.params.tooltipImages[0], after.params.tooltipImages[0].image]) {
    assert.equal(Object.hasOwn(value, 'unknown'), false);
  }
  assert.equal(after.params.tooltipImages[0].image.path, 'images/tooltip.png');
});

test('already-new AdvancedText 1.3 child survives the parent upgrade without transformation or child loading', async () => {
  const before = accordion([textChild(3, true)]);
  const result = await offeredUpgrade(before);
  assert.equal(result.invoked, true);
  assert.deepEqual(result.loads, ['H5P.AccordionPapiJo 1.2']);
  assert.deepEqual(childOf(result.content), childOf(before));
  assert.deepEqual(validate(result.content).content, result.content);
});

test('mixed legacy and new children converge to the same 1.3 dependency closure in either order', async () => {
  for (const children of [[textChild(2), textChild(3, true)], [textChild(3, true), textChild(2)]]) {
    const result = await offeredUpgrade(accordion(children));
    assert.deepEqual(result.loads, ['H5P.AccordionPapiJo 1.2', 'H5P.AdvancedTextPapiJo 1.3']);
    const filtered = validate(result.content);
    assert.deepEqual(filtered.errors, []);
    assert.deepEqual(filtered.content, result.content);
    assert.deepEqual(filtered.content.params.panels.map((panel) => panel.content.library),
      ['H5P.AdvancedTextPapiJo 1.3', 'H5P.AdvancedTextPapiJo 1.3']);
    assert.equal(filtered.dependencies['preloaded-H5P.AdvancedTextPapiJo'].library, 'H5P.AdvancedTextPapiJo 1.3');
    assert.equal(filtered.dependencies['editor-H5PEditor.AdvancedTextPapiJoTooltip'].library,
      'H5PEditor.AdvancedTextPapiJoTooltip 1.2');
  }
});

test('Image, Video and Audio retain option order, descriptors, parameters, paths and validation behavior', async () => {
  const children = [
    { library: 'H5P.Image 1.1', params: { file: { path: 'images/photo.png', mime: 'image/png', width: 60, height: 30 }, alt: 'Photo', decorative: false } },
    { library: 'H5P.Video 1.6', params: { sources: [{ path: 'videos/movie.mp4', mime: 'video/mp4' }], visuals: { fit: true, controls: true } } },
    { library: 'H5P.Audio 1.5', params: { files: [{ path: 'audios/sound.mp3', mime: 'audio/mpeg' }], playerMode: 'full', fitToWrapper: true, controls: true } }
  ].map((child) => ({ ...child, subContentId, metadata: { title: child.library, license: 'U' } }));
  const before = accordion(children);
  const result = await offeredUpgrade(before);
  assert.deepEqual(result.loads, ['H5P.AccordionPapiJo 1.2']);
  assert.deepEqual(result.content.params, before.params);
  assert.deepEqual(validate(result.content).content.params, validate(before, {
    parentManifest: baselineJSON('library.json'), parentSemantics: baselineJSON('semantics.json')
  }).content.params);
  const options = (semantics) => semantics.find((field) => field.name === 'panels')
    .field.fields.find((field) => field.name === 'content').options;
  assert.deepEqual(options(parentSemantics()).slice(1), options(baselineJSON('semantics.json')).slice(1));
});

test('negative regression: former 1.1.7 candidate is ineligible, invokes no engine, and rejects legacy children', async () => {
  const candidate = 'b49be8f02f2f1ba22f0bc8f17f652e993ce51dbd';
  const fromCandidate = (file) => JSON.parse(execFileSync('git', ['show', `${candidate}:${file}`], { cwd: root, encoding: 'utf8' }));
  const manifest = fromCandidate('library.json');
  const semantics = fromCandidate('semantics.json');
  assert.deepEqual([manifest.majorVersion, manifest.minorVersion, manifest.patchVersion], [1, 1, 7]);
  const before = accordion();
  const result = await offeredUpgrade(before, manifest, semantics);
  assert.equal(result.invoked, false);
  assert.deepEqual(result.loads, []);
  assert.deepEqual(result.content, before);
  assert.equal(childOf(result.content).library, 'H5P.AdvancedTextPapiJo 1.2');
  const rejected = validate(result.content, { parentManifest: manifest, parentSemantics: semantics });
  assert.equal(Object.hasOwn(rejected.content.params.panels[0], 'content'), false);
  assert.match(rejected.errors[0].message, /not valid.*1\.2.*1\.3/);
});

test('release metadata preserves baseline runtime and fixed dependencies, with no custom migration', () => {
  const manifest = parentManifest();
  const baselineManifest = baselineJSON('library.json');
  assert.deepEqual(manifest, { ...baselineManifest, minorVersion: 2, patchVersion: 0 });
  assert.equal(fs.existsSync(path.join(root, 'upgrades.js')), false);
  for (const file of ['h5p-accordion-papijo.js', 'h5p-accordion-papijo.css']) {
    assert.equal(fs.readFileSync(path.join(root, file), 'utf8'),
      execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8' }));
  }
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /release-preparation version is 1\.2\.0/);
  assert.match(readme, /minor version\s+boundary is intentional/);
  assert.match(readme, /recursively upgrades nested AdvancedTextPapiJo 1\.2 children to 1\.3/);
});
