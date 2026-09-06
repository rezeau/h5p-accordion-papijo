'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  PROJECT_ROOT,
  attachToDocument,
  createEnvironment,
  panelParts
} = require('../test-support/h5p-shim');

function panel(title, library = 'H5P.AdvancedTextPapiJo 1.1') {
  return {
    title,
    content: {
      library,
      params: { text: `<p>${title}</p>` },
      subContentId: `subcontent-${title}`
    }
  };
}

function createAccordion(environment, options = {}) {
  const params = {
    hTag: options.hTag ?? 'h2',
    panels: options.panels ?? [panel('First'), panel('Second'), panel('Third')]
  };
  return new environment.Accordion(params, options.contentId ?? 42, options.contentData);
}

test('creates one child per panel with the exact current newRunnable arguments', () => {
  const environment = createEnvironment();
  const panels = [panel('First'), panel('Second')];
  const contentData = { parent: { name: 'outer-container' }, previousState: { ignored: true } };
  const accordion = createAccordion(environment, { panels, contentData, contentId: 73 });

  assert.equal(accordion.instances.length, 2);
  assert.equal(environment.newRunnableCalls.length, 2);
  environment.newRunnableCalls.forEach((call, index) => {
    assert.equal(call.args.length, 2);
    assert.strictEqual(call.args[0], panels[index].content);
    assert.equal(call.args[1], 73);
    assert.strictEqual(accordion.instances[index], call.child);
  });
  assert.strictEqual(accordion.contentData, contentData);
});

test('builds alternating heading/button and region DOM with initial ARIA state', () => {
  const environment = createEnvironment();
  const accordion = createAccordion(environment);
  const { container } = attachToDocument(environment, accordion);
  const css = fs.readFileSync(path.join(PROJECT_ROOT, 'h5p-accordion-papijo.css'), 'utf8');

  assert.equal(container[0].children.length, 6);
  assert.match(
    css,
    /\.h5p-accordion-papijo\s+\.h5p-panel-content\s*{[^}]*display:\s*none;/s
  );
  for (let index = 0; index < 3; index++) {
    const { button, heading, region } = panelParts(container, index);
    assert.equal(heading.tagName, 'H2');
    assert.equal(heading.children.length, 1);
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.parent, heading);
    assert.equal(region.tagName, 'DIV');
    assert.equal(region.parent, container[0]);

    assert(heading.classes.has('h5p-panel-title'));
    assert(button.classes.has('h5p-panel-button'));
    assert(region.classes.has('h5p-panel-content'));
    assert.equal(button.attributes.get('tabindex'), '0');
    assert.equal(button.attributes.get('aria-expanded'), 'false');
    assert.equal(button.attributes.get('aria-controls'), region.attributes.get('id'));
    assert.equal(region.attributes.get('role'), 'region');
    assert.equal(region.attributes.get('aria-labelledby'), heading.attributes.get('id'));
    assert.equal(region.attributes.get('aria-hidden'), 'true');
    assert(!heading.classes.has('h5p-panel-expanded'));
  }
});

test('assigns unique heading and region IDs across Accordion instances', () => {
  const environment = createEnvironment();
  const first = attachToDocument(environment, createAccordion(environment)).container;
  const second = attachToDocument(environment, createAccordion(environment)).container;
  const ids = [...first[0].children, ...second[0].children]
    .map((element) => element.attributes.get('id'));

  assert.equal(new Set(ids).size, ids.length);
});

test('opens at most one panel and closes the currently open panel', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment));
  const first = panelParts(container, 0);
  const second = panelParts(container, 1);

  environment.fire(first.button, 'click');
  assert.equal(first.button.attributes.get('aria-expanded'), 'true');
  assert.equal(first.region.attributes.get('aria-hidden'), 'false');
  assert(first.heading.classes.has('h5p-panel-expanded'));

  environment.fire(second.button, 'click');
  assert.equal(first.button.attributes.get('aria-expanded'), 'false');
  assert.equal(first.region.attributes.get('aria-hidden'), 'true');
  assert(!first.heading.classes.has('h5p-panel-expanded'));
  assert.equal(second.button.attributes.get('aria-expanded'), 'true');
  assert.equal(second.region.attributes.get('aria-hidden'), 'false');
  assert(second.heading.classes.has('h5p-panel-expanded'));

  environment.fire(second.button, 'click');
  assert.equal(second.button.attributes.get('aria-expanded'), 'false');
  assert.equal(second.region.attributes.get('aria-hidden'), 'true');
  assert(!second.heading.classes.has('h5p-panel-expanded'));
});

test('moves focus with Up/Down/Left/Right and preserves focus at boundaries', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment));
  const buttons = [0, 1, 2].map((index) => panelParts(container, index).button);

  environment.$(buttons[1]).focus();
  assert.equal(environment.fire(buttons[1], 'keydown', { keyCode: 38 }), false);
  assert.strictEqual(environment.activeElement, buttons[0]);

  environment.$(buttons[1]).focus();
  assert.equal(environment.fire(buttons[1], 'keydown', { keyCode: 37 }), false);
  assert.strictEqual(environment.activeElement, buttons[0]);

  environment.$(buttons[1]).focus();
  assert.equal(environment.fire(buttons[1], 'keydown', { keyCode: 40 }), false);
  assert.strictEqual(environment.activeElement, buttons[2]);

  environment.$(buttons[1]).focus();
  assert.equal(environment.fire(buttons[1], 'keydown', { keyCode: 39 }), false);
  assert.strictEqual(environment.activeElement, buttons[2]);

  environment.$(buttons[0]).focus();
  assert.equal(environment.fire(buttons[0], 'keydown', { keyCode: 38 }), false);
  assert.strictEqual(environment.activeElement, buttons[0]);

  environment.$(buttons[2]).focus();
  assert.equal(environment.fire(buttons[2], 'keydown', { keyCode: 40 }), false);
  assert.strictEqual(environment.activeElement, buttons[2]);
});

test('Enter and Space toggle panels while unrelated keys do nothing', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment));
  const { button } = panelParts(container, 0);

  assert.equal(environment.fire(button, 'keydown', { keyCode: 13 }), false);
  assert.equal(button.attributes.get('aria-expanded'), 'true');
  assert.equal(environment.fire(button, 'keydown', { keyCode: 32 }), false);
  assert.equal(button.attributes.get('aria-expanded'), 'false');
  assert.equal(environment.fire(button, 'keydown', { keyCode: 65 }), undefined);
  assert.equal(button.attributes.get('aria-expanded'), 'false');
});

test('repeated attach reuses panel DOM and does not reattach children', () => {
  const environment = createEnvironment();
  const accordion = createAccordion(environment);
  const firstContainer = environment.createContainer().html('<p>Existing host content</p>');
  accordion.attach(firstContainer);
  const originalElements = [...firstContainer[0].children];
  const secondContainer = environment.createContainer();

  assert.equal(firstContainer.html(), '');
  accordion.attach(secondContainer);

  assert.equal(firstContainer[0].children.length, 0);
  assert.deepEqual(secondContainer[0].children, originalElements);
  assert.deepEqual(Array.from(accordion.instances, (child) => child.attachCount), [1, 1, 1]);
  assert(secondContainer.hasClass('h5p-accordion-papijo'));
  assert(secondContainer.hasClass('h5p-theme'));
});

test('emits one completed consumed xAPI event on first attach before children attach', () => {
  const environment = createEnvironment();
  const accordion = createAccordion(environment);
  const firstContainer = environment.createContainer();
  const secondContainer = environment.createContainer();

  accordion.attach(firstContainer);
  accordion.attach(secondContainer);

  const xapiEvents = accordion._triggered.filter((event) => event.type === 'xAPI');
  assert.equal(xapiEvents.length, 1);
  assert.equal(xapiEvents[0].verb.id, 'http://activitystrea.ms/schema/1.0/consume');
  assert.equal(xapiEvents[0].verb.display['en-US'], 'consumed');
  assert.equal(xapiEvents[0].extras.result.completion, true);
  assert.equal(environment.timeline[0].kind, 'event');
  assert.equal(environment.timeline[0].event.type, 'xAPI');
  assert.equal(environment.timeline[1].kind, 'childAttach');
});

test('does not implement container content-state saving', () => {
  const environment = createEnvironment();
  const accordion = createAccordion(environment);

  assert.equal(accordion.getCurrentState, undefined);
});

test('attaches every child while its panel is detached from the document', () => {
  const environment = createEnvironment();
  attachToDocument(environment, createAccordion(environment));

  assert.deepEqual(
    environment.childAttachTimeline.map((entry) => entry.isConnected),
    [false, false, false]
  );
});

test('resize work runs during a transition and stops when it completes', () => {
  const environment = createEnvironment();
  const accordion = createAccordion(environment, { panels: [panel('Only')] });
  const { container } = attachToDocument(environment, accordion);
  const { button } = panelParts(container, 0);

  environment.fire(button, 'click');
  environment.clock.tick(199);
  assert.equal(accordion._triggered.filter((event) => event.type === 'resize').length, 4);

  environment.clock.tick(1);
  assert.equal(accordion._triggered.filter((event) => event.type === 'resize').length, 5);
  environment.clock.tick(400);
  assert.equal(accordion._triggered.filter((event) => event.type === 'resize').length, 5);
  assert.equal(environment.clock.pendingCount(), 0);
});

test('startWorkLoop repeats until stopWorkLoop is called', () => {
  const environment = createEnvironment();
  const accordion = createAccordion(environment, { panels: [] });
  let calls = 0;

  const loopId = accordion.startWorkLoop(() => calls++, 25);
  environment.clock.tick(75);
  assert.equal(calls, 3);
  accordion.stopWorkLoop(loopId);
  environment.clock.tick(100);
  assert.equal(calls, 3);
});

test('supports the current h2, h3 and h4 heading levels', async (t) => {
  for (const headingLevel of ['h2', 'h3', 'h4']) {
    await t.test(headingLevel, () => {
      const environment = createEnvironment();
      const accordion = createAccordion(environment, {
        hTag: headingLevel,
        panels: [panel('Only')]
      });
      const { container } = attachToDocument(environment, accordion);
      assert.equal(panelParts(container, 0).heading.tagName, headingLevel.toUpperCase());
    });
  }
});

test('all manifests, semantics and language files contain valid JSON', () => {
  const jsonFiles = [
    'library.json',
    'semantics.json',
    ...fs.readdirSync(path.join(PROJECT_ROOT, 'language'))
      .filter((name) => name.endsWith('.json'))
      .map((name) => `language/${name}`)
  ];

  assert.deepEqual(jsonFiles.sort(), [
    'language/.en.json',
    'language/fr.json',
    'library.json',
    'semantics.json'
  ]);

  for (const relativePath of jsonFiles) {
    assert.doesNotThrow(
      () => JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8')),
      relativePath
    );
  }
});

test('semantics allows exactly the current five child libraries', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'semantics.json'), 'utf8'));
  const panels = semantics.find((field) => field.name === 'panels');
  const content = panels.field.fields.find((field) => field.name === 'content');

  assert.deepEqual(content.options, [
    'H5P.AdvancedTextPapiJo 1.1',
    'H5P.Image 1.1',
    'H5P.Video 1.6',
    'H5P.Audio 1.5',
    'H5P.TextareaPapiJo 1.0'
  ]);
});

test('uses only the PapiJo runtime namespace and root class', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment));
  const source = fs.readFileSync(path.join(PROJECT_ROOT, 'h5p-accordion-papijo.js'), 'utf8');
  const css = fs.readFileSync(path.join(PROJECT_ROOT, 'h5p-accordion-papijo.css'), 'utf8');

  assert.equal(typeof environment.H5P.AccordionPapiJo, 'function');
  assert.equal(environment.H5P.Accordion, undefined);
  assert(container.hasClass('h5p-accordion-papijo'));
  assert(!container.hasClass('h5p-accordion'));
  assert.match(source, /H5P\.AccordionPapiJo/);
  assert.doesNotMatch(source, /H5P\.Accordion\s*=/);
  assert.match(css, /\.h5p-accordion-papijo/);
  assert.doesNotMatch(css, /\.h5p-accordion(?=[\s.{:#>])/);
});

test.todo('panel regions are labelled directly by their controlling buttons', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment));
  const { button, region } = panelParts(container, 0);
  assert.ok(button.attributes.get('id'));
  assert.equal(region.attributes.get('aria-labelledby'), button.attributes.get('id'));
});

test.todo('translation files match the semantics field order and contain no placeholders', () => {
  const english = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'language', '.en.json'), 'utf8')
  );
  const french = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'language', 'fr.json'), 'utf8')
  );
  const serializedTranslations = JSON.stringify({ english, french });

  assert.equal(english.semantics.length, 2);
  assert.equal(english.semantics[0].label, 'Panels');
  assert.match(english.semantics[1].label, /^H tags/);
  assert.equal(french.semantics.length, 2);
  assert.equal(french.semantics[0].label, 'Panneaux');
  assert.doesNotMatch(serializedTranslations, /TODO/);
});

test.todo('the obsolete accordionTitle authoring field is removed from semantics', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'semantics.json'), 'utf8'));
  assert.equal(semantics.some((field) => field.name === 'accordionTitle'), false);
});
