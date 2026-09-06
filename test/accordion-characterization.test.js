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
  if (Object.hasOwn(options, 'accordionTitle')) {
    params.accordionTitle = options.accordionTitle;
  }
  return new environment.Accordion(params, options.contentId ?? 42, options.contentData);
}

const NAVIGATION_CLASSES = {
  container: 'h5p-accordion-papijo-navigation',
  item: 'h5p-accordion-papijo-navigation-item',
  list: 'h5p-accordion-papijo-navigation-list',
  selectedItem: 'h5p-accordion-papijo-navigation-item-selected',
  toggle: 'h5p-accordion-papijo-navigation-toggle'
};

function descendantsWithClass(element, className) {
  const matches = [];
  for (const child of element.children) {
    if (child.classes.has(className)) {
      matches.push(child);
    }
    matches.push(...descendantsWithClass(child, className));
  }
  return matches;
}

function navigationParts(container) {
  return {
    containers: descendantsWithClass(container[0], NAVIGATION_CLASSES.container),
    items: descendantsWithClass(container[0], NAVIGATION_CLASSES.item),
    lists: descendantsWithClass(container[0], NAVIGATION_CLASSES.list),
    toggles: descendantsWithClass(container[0], NAVIGATION_CLASSES.toggle)
  };
}

function attachAccordionWithNavigation(environment, options = {}) {
  const accordion = createAccordion(environment, {
    accordionTitle: 'Choose a panel',
    ...options
  });
  const { container } = attachToDocument(environment, accordion);
  const navigation = navigationParts(container);
  assert.equal(navigation.containers.length, 1, 'expected one compact navigation container');
  assert.equal(navigation.toggles.length, 1, 'expected one compact navigation toggle');
  assert.equal(navigation.lists.length, 1, 'expected one compact navigation list');
  return { accordion, container, navigation };
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
    assert.equal(heading.attributes.has('hidden'), false);
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

test('semantics currently has the historical five child-library options', () => {
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

test.todo('newly authored panels allow exactly four libraries and exclude TextareaPapiJo', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'semantics.json'), 'utf8'));
  const panels = semantics.find((field) => field.name === 'panels');
  const content = panels.field.fields.find((field) => field.name === 'content');
  const intendedOptions = [
    'H5P.AdvancedTextPapiJo 1.1',
    'H5P.Image 1.1',
    'H5P.Video 1.6',
    'H5P.Audio 1.5'
  ];

  assert.deepEqual(content.options, intendedOptions);
  assert.equal(content.options.includes('H5P.TextareaPapiJo 1.0'), false);
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

test('compact navigation is absent with zero panels', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment, {
    accordionTitle: 'Choose a panel',
    panels: []
  }));

  assert.deepEqual(navigationParts(container).containers, []);
});

test('compact navigation is absent with one panel', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment, {
    accordionTitle: 'Choose a panel',
    panels: [panel('Only')]
  }));

  assert.deepEqual(navigationParts(container).containers, []);
});

test('compact navigation is absent when accordionTitle is missing', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment));

  assert.deepEqual(navigationParts(container).containers, []);
});

test('compact navigation is absent when accordionTitle is empty', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment, {
    accordionTitle: ''
  }));

  assert.deepEqual(navigationParts(container).containers, []);
});

test('compact navigation is absent when accordionTitle contains only whitespace', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment, {
    accordionTitle: ' \t\r\n '
  }));

  assert.deepEqual(navigationParts(container).containers, []);
});

test('compact navigation is present with at least two panels and a trimmed non-empty title', () => {
  const environment = createEnvironment();
  const { navigation } = attachAccordionWithNavigation(environment, {
    accordionTitle: 'Choose a panel',
    panels: [panel('First'), panel('Second')]
  });

  assert.equal(navigation.toggles[0].innerHTML, 'Choose a panel');
});

test('legacy multi-panel content with accordionTitle receives navigation automatically', () => {
  const environment = createEnvironment();
  const legacyParams = {
    accordionTitle: 'Legacy navigation title',
    hTag: 'h3',
    panels: [panel('Legacy first'), panel('Legacy second')]
  };
  const accordion = new environment.Accordion(legacyParams, 91, {});
  const { container } = attachToDocument(environment, accordion);
  const navigation = navigationParts(container);

  assert.equal(navigation.containers.length, 1);
  assert.equal(navigation.toggles[0].innerHTML, 'Legacy navigation title');
});

test('navigation title control is a native type=button button', () => {
  const environment = createEnvironment();
  const { navigation } = attachAccordionWithNavigation(environment);
  const toggle = navigation.toggles[0];

  assert.equal(toggle.tagName, 'BUTTON');
  assert.equal(toggle.attributes.get('type'), 'button');
  assert.equal(toggle.attributes.has('role'), false);
  assert.equal(toggle.attributes.has('aria-haspopup'), false);
  assert.equal(toggle.attributes.has('aria-pressed'), false);
});

test('navigation title and list IDs are unique across Accordion instances', () => {
  const environment = createEnvironment();
  const first = attachAccordionWithNavigation(environment).navigation;
  const second = attachAccordionWithNavigation(environment).navigation;
  const ids = [
    first.toggles[0].attributes.get('id'),
    first.lists[0].attributes.get('id'),
    second.toggles[0].attributes.get('id'),
    second.lists[0].attributes.get('id')
  ];

  assert(ids.every(Boolean));
  assert.equal(new Set(ids).size, ids.length);
});

test('navigation title has correct initial disclosure ARIA and controls its list', () => {
  const environment = createEnvironment();
  const { navigation } = attachAccordionWithNavigation(environment);
  const toggle = navigation.toggles[0];
  const list = navigation.lists[0];

  assert.equal(toggle.attributes.get('aria-expanded'), 'false');
  assert.equal(toggle.attributes.get('aria-controls'), list.attributes.get('id'));
  assert.equal(list.attributes.get('aria-labelledby'), toggle.attributes.get('id'));
  assert.equal(list.attributes.has('hidden'), true);
});

test('navigation uses an ordinary inline list without menu roles', () => {
  const environment = createEnvironment();
  const { navigation } = attachAccordionWithNavigation(environment);
  const list = navigation.lists[0];

  assert.equal(list.tagName, 'UL');
  assert.notEqual(list.attributes.get('role'), 'menu');
  for (const item of navigation.items) {
    assert.notEqual(item.attributes.get('role'), 'menuitem');
  }
});

test('navigation has one native selection button per panel in panel order', () => {
  const environment = createEnvironment();
  const panels = [panel('Alpha'), panel('Beta'), panel('Gamma')];
  const { navigation } = attachAccordionWithNavigation(environment, { panels });

  assert.equal(navigation.items.length, panels.length);
  assert.deepEqual(navigation.items.map((item) => item.innerHTML), ['Alpha', 'Beta', 'Gamma']);
  for (const item of navigation.items) {
    assert.equal(item.tagName, 'BUTTON');
    assert.equal(item.attributes.get('type'), 'button');
  }
});

test('compact mode initially hides every original panel header and panel content', () => {
  const environment = createEnvironment();
  const { container } = attachAccordionWithNavigation(environment);

  for (let index = 0; index < 3; index++) {
    const { heading, region } = panelParts(container, index);
    assert.equal(heading.attributes.has('hidden'), true);
    assert.equal(region.attributes.get('aria-hidden'), 'true');
  }
});

test('navigation title button toggles the list open and closed', () => {
  const environment = createEnvironment();
  const { accordion, navigation } = attachAccordionWithNavigation(environment);
  const toggle = navigation.toggles[0];
  const list = navigation.lists[0];

  environment.fire(toggle, 'click');
  assert.equal(toggle.attributes.get('aria-expanded'), 'true');
  assert.equal(list.attributes.has('hidden'), false);
  assert.equal(accordion._triggered.filter((event) => event.type === 'resize').length, 1);

  environment.fire(toggle, 'click');
  assert.equal(toggle.attributes.get('aria-expanded'), 'false');
  assert.equal(list.attributes.has('hidden'), true);
  assert.equal(accordion._triggered.filter((event) => event.type === 'resize').length, 2);
});

test('Escape inside open navigation closes it and returns focus to the title', () => {
  const environment = createEnvironment();
  const { navigation } = attachAccordionWithNavigation(environment);
  const toggle = navigation.toggles[0];
  const list = navigation.lists[0];

  environment.fire(toggle, 'click');
  environment.$(navigation.items[0]).focus();
  environment.fire(list, 'keydown', {
    key: 'Escape',
    keyCode: 27,
    preventDefault() {}
  });

  assert.equal(toggle.attributes.get('aria-expanded'), 'false');
  assert.equal(list.attributes.has('hidden'), true);
  assert.strictEqual(environment.activeElement, toggle);
});

test('selecting a navigation item opens its target panel and closes a different panel', () => {
  const environment = createEnvironment();
  const { container, navigation } = attachAccordionWithNavigation(environment);
  const first = panelParts(container, 0);
  const second = panelParts(container, 1);

  environment.fire(first.button, 'click');
  environment.fire(navigation.toggles[0], 'click');
  environment.fire(navigation.items[1], 'click');

  assert.equal(first.button.attributes.get('aria-expanded'), 'false');
  assert.equal(first.region.attributes.get('aria-hidden'), 'true');
  assert.equal(second.button.attributes.get('aria-expanded'), 'true');
  assert.equal(second.region.attributes.get('aria-hidden'), 'false');
});

test('selecting the already-open panel through navigation leaves it open', () => {
  const environment = createEnvironment();
  const { container, navigation } = attachAccordionWithNavigation(environment);
  const first = panelParts(container, 0);

  environment.fire(first.button, 'click');
  environment.fire(navigation.toggles[0], 'click');
  environment.fire(navigation.items[0], 'click');

  assert.equal(first.button.attributes.get('aria-expanded'), 'true');
  assert.equal(first.region.attributes.get('aria-hidden'), 'false');
  assert(first.heading.classes.has('h5p-panel-expanded'));
  assert(navigation.items[0].classes.has(NAVIGATION_CLASSES.selectedItem));
  assert.equal(navigation.lists[0].attributes.has('hidden'), false);
});

test('navigation stays open and focus moves to the selected panel header after selection', () => {
  const environment = createEnvironment();
  const { container, navigation } = attachAccordionWithNavigation(environment);
  const second = panelParts(container, 1);

  environment.fire(navigation.toggles[0], 'click');
  environment.fire(navigation.items[1], 'click');

  assert.equal(navigation.toggles[0].attributes.get('aria-expanded'), 'true');
  assert.equal(navigation.lists[0].attributes.has('hidden'), false);
  assert.strictEqual(environment.activeElement, second.button);
});

test('selection shows only its large header and content and marks only its compact label', () => {
  const environment = createEnvironment();
  const { container, navigation } = attachAccordionWithNavigation(environment);

  environment.fire(navigation.toggles[0], 'click');
  environment.fire(navigation.items[1], 'click');

  for (let index = 0; index < 3; index++) {
    const { heading, region } = panelParts(container, index);
    const isSelected = index === 1;
    assert.equal(heading.attributes.has('hidden'), !isSelected);
    assert.equal(region.attributes.get('aria-hidden'), isSelected ? 'false' : 'true');
    assert.equal(navigation.items[index].classes.has(NAVIGATION_CLASSES.selectedItem), isSelected);
    assert.equal(navigation.items[index].attributes.get('aria-current'), isSelected ? 'true' : undefined);
  }
});

test('selected compact label uses the H5P selected background and foreground theme colors', () => {
  const css = fs.readFileSync(path.join(PROJECT_ROOT, 'h5p-accordion-papijo.css'), 'utf8');

  assert.match(
    css,
    /\.h5p-accordion-papijo[^{}]*\.h5p-accordion-papijo-navigation-item-selected\s*{[^}]*background(?:-color)?:\s*var\(--h5p-theme-main-cta-base\);[^}]*color:\s*var\(--h5p-theme-contrast-cta\);/s
  );
  const selectedInteractionRule = css.match(
    /\.h5p-accordion-papijo[^{}]*\.h5p-accordion-papijo-navigation-item-selected:hover,[^{]*\.h5p-accordion-papijo[^{}]*\.h5p-accordion-papijo-navigation-item-selected:focus,[^{]*\.h5p-accordion-papijo[^{}]*\.h5p-accordion-papijo-navigation-item-selected:focus-visible,[^{]*\.h5p-accordion-papijo[^{}]*\.h5p-accordion-papijo-navigation-item-selected:active\s*{([^}]*)}/s
  );
  assert.ok(selectedInteractionRule, 'expected a selected-state interaction rule');
  assert.match(selectedInteractionRule[1], /background(?:-color)?:\s*var\(--h5p-theme-main-cta-base\);/);
  assert.match(selectedInteractionRule[1], /color:\s*var\(--h5p-theme-contrast-cta\);/);
});

test('selecting another compact label transfers the one selected state and visible panel', () => {
  const environment = createEnvironment();
  const { container, navigation } = attachAccordionWithNavigation(environment);

  environment.fire(navigation.toggles[0], 'click');
  environment.fire(navigation.items[0], 'click');
  environment.fire(navigation.items[2], 'click');

  assert.equal(
    navigation.items.filter((item) => item.classes.has(NAVIGATION_CLASSES.selectedItem)).length,
    1
  );
  for (let index = 0; index < 3; index++) {
    const { heading, region } = panelParts(container, index);
    const isSelected = index === 2;
    assert.equal(heading.attributes.has('hidden'), !isSelected);
    assert.equal(region.attributes.get('aria-hidden'), isSelected ? 'false' : 'true');
    assert.equal(navigation.items[index].classes.has(NAVIGATION_CLASSES.selectedItem), isSelected);
  }
});

test('closing the selected panel through its large header clears compact selection', () => {
  const environment = createEnvironment();
  const { container, navigation } = attachAccordionWithNavigation(environment);
  const first = panelParts(container, 0);

  environment.fire(navigation.toggles[0], 'click');
  environment.fire(navigation.items[0], 'click');
  environment.fire(first.button, 'click');

  assert.equal(first.region.attributes.get('aria-hidden'), 'true');
  assert.equal(first.heading.attributes.has('hidden'), true);
  assert.equal(
    navigation.items.some((item) => item.classes.has(NAVIGATION_CLASSES.selectedItem)),
    false
  );
  assert.equal(navigation.lists[0].attributes.has('hidden'), false);
  assert.equal(navigation.toggles[0].attributes.get('aria-expanded'), 'true');
});

test('title fully collapses an open panel and reopens with no panel or compact selection', () => {
  const environment = createEnvironment();
  const { container, navigation } = attachAccordionWithNavigation(environment);
  const first = panelParts(container, 0);

  environment.fire(navigation.toggles[0], 'click');
  environment.fire(navigation.items[0], 'click');
  environment.fire(navigation.toggles[0], 'click');

  assert.equal(navigation.toggles[0].attributes.get('aria-expanded'), 'false');
  assert.equal(navigation.lists[0].attributes.has('hidden'), true);
  assert.equal(first.button.attributes.get('aria-expanded'), 'false');
  assert.equal(first.heading.attributes.has('hidden'), true);
  assert.equal(first.region.attributes.get('aria-hidden'), 'true');
  assert.equal(
    navigation.items.some((item) => item.classes.has(NAVIGATION_CLASSES.selectedItem)),
    false
  );

  environment.fire(navigation.toggles[0], 'click');

  assert.equal(navigation.toggles[0].attributes.get('aria-expanded'), 'true');
  assert.equal(navigation.lists[0].attributes.has('hidden'), false);
  for (let index = 0; index < 3; index++) {
    const { button, heading, region } = panelParts(container, index);
    assert.equal(button.attributes.get('aria-expanded'), 'false');
    assert.equal(heading.attributes.has('hidden'), true);
    assert.equal(region.attributes.get('aria-hidden'), 'true');
    assert.equal(navigation.items[index].classes.has(NAVIGATION_CLASSES.selectedItem), false);
    assert.equal(navigation.items[index].attributes.has('aria-current'), false);
  }
});

test('navigation selection preserves the existing resize behavior', () => {
  const environment = createEnvironment();
  const { accordion, navigation } = attachAccordionWithNavigation(environment);

  environment.fire(navigation.toggles[0], 'click');
  environment.fire(navigation.items[1], 'click');
  environment.clock.tick(200);

  assert(accordion._triggered.some((event) => event.type === 'resize'));
});

test('multiple compact navigation controls remain behaviorally isolated', () => {
  const environment = createEnvironment();
  const first = attachAccordionWithNavigation(environment).navigation;
  const second = attachAccordionWithNavigation(environment).navigation;

  environment.fire(first.toggles[0], 'click');

  assert.equal(first.toggles[0].attributes.get('aria-expanded'), 'true');
  assert.equal(first.lists[0].attributes.has('hidden'), false);
  assert.equal(second.toggles[0].attributes.get('aria-expanded'), 'false');
  assert.equal(second.lists[0].attributes.has('hidden'), true);

  environment.fire(first.items[1], 'click');
  assert(first.items[1].classes.has(NAVIGATION_CLASSES.selectedItem));
  assert.equal(
    second.items.some((item) => item.classes.has(NAVIGATION_CLASSES.selectedItem)),
    false
  );
});

test('repeated attach reuses one navigation control without duplicating handlers', () => {
  const environment = createEnvironment();
  const accordion = createAccordion(environment, { accordionTitle: 'Choose a panel' });
  const firstContainer = attachToDocument(environment, accordion).container;
  const firstNavigation = navigationParts(firstContainer);
  assert.equal(firstNavigation.containers.length, 1);
  const originalNavigation = firstNavigation.containers[0];

  const secondContainer = environment.createContainer();
  accordion.attach(secondContainer);
  const secondNavigation = navigationParts(secondContainer);

  assert.equal(secondNavigation.containers.length, 1);
  assert.strictEqual(secondNavigation.containers[0], originalNavigation);
  environment.fire(secondNavigation.toggles[0], 'click');
  assert.equal(secondNavigation.toggles[0].attributes.get('aria-expanded'), 'true');
});

test.todo('panel regions are labelled directly by their controlling buttons', () => {
  const environment = createEnvironment();
  const { container } = attachToDocument(environment, createAccordion(environment));
  const { button, region } = panelParts(container, 0);
  assert.ok(button.attributes.get('id'));
  assert.equal(region.attributes.get('aria-labelledby'), button.attributes.get('id'));
});

test.todo('accordionTitle semantics and translations describe compact panel navigation', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'semantics.json'), 'utf8'));
  const english = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'language', '.en.json'), 'utf8')
  );
  const french = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'language', 'fr.json'), 'utf8')
  );
  const serializedTranslations = JSON.stringify({ english, french });
  const accordionTitle = semantics.find((field) => field.name === 'accordionTitle');

  assert.equal(accordionTitle.label, 'Panel navigation label');
  assert.equal(accordionTitle.optional, true);
  assert.match(accordionTitle.description, /at least two panels/i);
  assert.match(accordionTitle.description, /leaving it empty disables/i);
  assert.equal(english.semantics.length, semantics.length);
  assert.equal(english.semantics[0].label, 'Panel navigation label');
  assert.equal(english.semantics[1].label, 'Panels');
  assert.match(english.semantics[2].label, /^H tags/);
  assert.equal(french.semantics.length, semantics.length);
  assert.equal(french.semantics[0].label, 'Libellé de navigation des panneaux');
  assert.equal(french.semantics[1].label, 'Panneaux');
  assert.doesNotMatch(serializedTranslations, /TODO/);
});
