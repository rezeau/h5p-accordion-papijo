'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pluginRoot = process.env.H5P_PLUGIN_ROOT || 'C:/wamp64/www/wp-test/wp-content/plugins/h5p';
const librariesRoot = process.env.H5P_LIBRARIES_ROOT || 'C:/wamp64/www/wp-test/wp-content/uploads/h5p/libraries';
const advancedTextRoot = process.env.H5P_ADVANCEDTEXT_ROOT || path.resolve(root, '../papi-jo-h5p-advancedtext');
const advancedTextRelease = 'f07b03c0457741080b198b1839bcb86ef769cafd';
const php = process.env.H5P_PHP_BIN || 'php';
const baseline = 'ae5e9266d93b8bb18fd3eb419bcf3fdcf9e9bb46';
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const baselineJSON = (file) => JSON.parse(execFileSync('git', ['show', `${baseline}:${file}`], {
  cwd: root, encoding: 'utf8'
}));
const parentManifest = () => readJSON(path.join(root, 'library.json'));
const parentSemantics = () => readJSON(path.join(root, 'semantics.json'));
const libraryRow = (manifest, id) => ({
  id, name: manifest.machineName,
  major_version: manifest.majorVersion,
  minor_version: manifest.minorVersion,
  patch_version: manifest.patchVersion
});

function probe(input) {
  const result = spawnSync(php, ['-d', 'log_errors=0', '-d', 'xdebug.mode=off',
    path.join(__dirname, 'installed-h5p-probe.php')], {
    input: JSON.stringify({ pluginRoot, librariesRoot, advancedTextRoot,
      parentManifest: parentManifest(), parentSemantics: parentSemantics(), ...input }),
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '', 'Installed core probe must not emit PHP warnings');
  return JSON.parse(result.stdout);
}

function eligibility(target = parentManifest()) {
  const source = libraryRow(baselineJSON('library.json'), 116);
  const versions = [source, libraryRow({ ...baselineJSON('library.json'), patchVersion: 7 }, 117),
    libraryRow(target, 120)];
  return probe({ operation: 'eligibility', source, versions });
}

// This gate models WordPress display_content_upgrades -> core.getUpgrades ->
// selected version -> ContentUpgradeProcess. Never invoke a 1.1 -> 1.1 job.
async function offeredUpgrade(content, target = parentManifest(), semantics = parentSemantics()) {
  const offered = eligibility(target);
  if (!Object.hasOwn(offered, '120')) {
    return { offered, invoked: false, content: structuredClone(content), loads: [] };
  }
  const context = vm.createContext({ H5P: {}, setTimeout, console });
  for (const file of ['h5p-version.js', 'h5p-content-upgrade-process.js']) {
    vm.runInContext(fs.readFileSync(path.join(pluginRoot, 'h5p-php-library/js', file), 'utf8'), context,
      { filename: file });
  }
  const loads = [];
  const loadLibrary = (name, version, next) => {
    try {
      const descriptor = `${name} ${version.major}.${version.minor}`;
      loads.push(descriptor);
      let librarySemantics;
      let upgradesScript;
      if (name === target.machineName) {
        librarySemantics = semantics;
      }
      else {
        const directory = name === 'H5P.AdvancedTextPapiJo' && version.major === 1 && version.minor === 3
          ? advancedTextRoot
          : path.join(librariesRoot, `${name}-${version.major}.${version.minor}`);
        librarySemantics = readJSON(path.join(directory, 'semantics.json'));
        const script = path.join(directory, 'upgrades.js');
        if (fs.existsSync(script)) {
          upgradesScript = script;
          vm.runInContext(fs.readFileSync(script, 'utf8'), context, { filename: script });
        }
      }
      // Semantics must belong to the engine's realm for its instanceof Array tests.
      const library = vm.runInContext(`(${JSON.stringify({ name,
        version: { major: version.major, minor: version.minor },
        semantics: librarySemantics, upgradesScript })})`, context);
      next(null, library);
    }
    catch (error) { next(error); }
  };
  const output = await new Promise((resolve, reject) => {
    new context.H5P.ContentUpgradeProcess(target.machineName,
      new context.H5P.Version('1.1'), new context.H5P.Version(offered['120']),
      JSON.stringify({ params: content.params, metadata: content.metadata }),
      1, loadLibrary, (error, result) => error ? reject(error) : resolve(JSON.parse(result)));
  });
  return { offered, invoked: true, loads, content: {
    ...structuredClone(content),
    library: `${target.machineName} ${target.majorVersion}.${target.minorVersion}`,
    ...output
  } };
}

const validate = (content, overrides = {}) => probe({ operation: 'validate', content, ...overrides });

module.exports = { root, pluginRoot, librariesRoot, advancedTextRoot, advancedTextRelease,
  baseline, readJSON, baselineJSON,
  parentManifest, parentSemantics, eligibility, offeredUpgrade, validate };
