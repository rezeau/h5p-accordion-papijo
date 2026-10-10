<?php
// Read-only probe: no wp-load.php, database, filesystem writes or WordPress hooks.
error_reporting(E_ALL);
ini_set('display_errors', 'stderr');
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
require_once $input['pluginRoot'] . '/h5p-php-library/h5p.classes.php';

class ProbeFramework {
  public $errors = array();
  public function t($message, $replacements = array()) {
    return strtr($message, $replacements);
  }
  public function setErrorMessage($message, $code = null) {
    $this->errors[] = array('message' => $message, 'code' => $code);
  }
}

// Substitute only library storage. Eligibility, validation, sanitization and
// recursive dependency resolution remain the installed H5P implementation.
class ReadOnlyProbeCore extends H5PCore {
  private $probeInput;
  public function __construct($input, $framework) {
    $this->probeInput = $input;
    $this->h5pF = $framework;
    // The normal core constructor also configures storage and site detection.
    // Only its file-path regexp is needed by this isolated content validator.
    $this->relativePathRegExp = '/^((\.\.\/){1,2})(.*content\/)?(\d+|editor)\/(.+)$/';
  }
  private function libraryDirectory($name, $major, $minor) {
    if ($name === 'H5P.AdvancedTextPapiJo' && (int)$major === 1 && (int)$minor === 3) {
      return $this->probeInput['advancedTextRoot'];
    }
    if ($name === 'H5PEditor.AdvancedTextPapiJoTooltip' && (int)$major === 1 && (int)$minor === 2) {
      return $this->probeInput['advancedTextRoot'] . '/editor';
    }
    return $this->probeInput['librariesRoot'] . '/' . $name . '-' . $major . '.' . $minor;
  }
  public function loadLibrary($name, $majorVersion, $minorVersion) {
    if ($name === 'H5P.AccordionPapiJo') {
      return $this->probeInput['parentManifest'];
    }
    $path = $this->libraryDirectory($name, $majorVersion, $minorVersion) . '/library.json';
    if (!is_file($path)) {
      throw new RuntimeException('Missing installed library: ' . $path);
    }
    return json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
  }
  public function loadLibrarySemantics($name, $majorVersion, $minorVersion) {
    if ($name === 'H5P.AccordionPapiJo') {
      return json_decode(json_encode($this->probeInput['parentSemantics']));
    }
    $path = $this->libraryDirectory($name, $majorVersion, $minorVersion) . '/semantics.json';
    if (!is_file($path)) {
      throw new RuntimeException('Missing installed semantics: ' . $path);
    }
    return json_decode(file_get_contents($path), false, 512, JSON_THROW_ON_ERROR);
  }
}

$framework = new ProbeFramework();
$core = new ReadOnlyProbeCore($input, $framework);
if ($input['operation'] === 'eligibility') {
  $versions = array_map(function ($version) { return (object)$version; }, $input['versions']);
  $result = $core->getUpgrades((object)$input['source'], $versions);
  echo json_encode((object)$result, JSON_THROW_ON_ERROR);
}
elseif ($input['operation'] === 'validate') {
  $validator = new H5PContentValidator($framework, $core);
  $content = json_decode(json_encode($input['content']));
  $validator->validateLibrary($content, (object)array(
    'options' => array($content->library)
  ));
  $dependencies = array();
  foreach ($validator->getDependencies() as $key => $dependency) {
    $dependencies[$key] = array(
      'library' => H5PCore::libraryToString($dependency['library']),
      'type' => $dependency['type'],
      'weight' => $dependency['weight']
    );
  }
  echo json_encode(array(
    'content' => $content,
    'dependencies' => $dependencies,
    'errors' => $framework->errors
  ), JSON_THROW_ON_ERROR);
}
else {
  throw new RuntimeException('Unknown probe operation');
}
