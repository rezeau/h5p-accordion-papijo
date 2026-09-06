'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(PROJECT_ROOT, 'h5p-accordion-papijo.js');

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.nextOrder = 1;
    this.tasks = [];
  }

  setTimeout(callback, delay = 0, ...args) {
    const task = {
      id: this.nextId++,
      order: this.nextOrder++,
      due: this.now + Number(delay),
      callback,
      args,
      cancelled: false
    };

    this.tasks.push(task);
    return task.id;
  }

  clearTimeout(id) {
    const task = this.tasks.find((candidate) => candidate.id === id);
    if (task) {
      task.cancelled = true;
    }
  }

  tick(milliseconds) {
    const target = this.now + milliseconds;
    let executions = 0;

    while (true) {
      const next = this.tasks
        .filter((task) => !task.cancelled && task.due <= target)
        .sort((left, right) => left.due - right.due || left.order - right.order)[0];

      if (!next) {
        break;
      }

      this.tasks = this.tasks.filter((task) => task !== next);
      this.now = next.due;
      next.callback(...next.args);

      executions++;
      if (executions > 10000) {
        throw new Error('Fake timer execution limit exceeded');
      }
    }

    this.now = target;
  }

  pendingCount() {
    return this.tasks.filter((task) => !task.cancelled).length;
  }
}

class TestElement {
  constructor(tagName, environment) {
    this.tagName = tagName.toUpperCase();
    this.environment = environment;
    this.attributes = new Map();
    this.classes = new Set();
    this.children = [];
    this.parent = null;
    this.innerHTML = '';
    this.handlers = Object.create(null);
    this.display = '';
    this.animation = null;
  }
}

class JQueryCollection {
  constructor(elements, environment) {
    this.elements = elements.filter(Boolean);
    this.environment = environment;
    this.length = this.elements.length;

    this.elements.forEach((element, index) => {
      this[index] = element;
    });
  }

  html(value) {
    if (value === undefined) {
      return this.elements[0]?.innerHTML;
    }

    for (const element of this.elements) {
      for (const child of element.children) {
        child.parent = null;
      }
      element.children = [];
      element.innerHTML = String(value);
    }
    return this;
  }

  addClass(classNames) {
    for (const element of this.elements) {
      for (const className of String(classNames).split(/\s+/).filter(Boolean)) {
        element.classes.add(className);
      }
    }
    return this;
  }

  removeClass(classNames) {
    for (const element of this.elements) {
      for (const className of String(classNames).split(/\s+/).filter(Boolean)) {
        element.classes.delete(className);
      }
    }
    return this;
  }

  hasClass(className) {
    return this.elements[0]?.classes.has(className) ?? false;
  }

  append(value) {
    const children = normalizeElements(value);

    for (const parent of this.elements) {
      for (const child of children) {
        if (child.parent) {
          child.parent.children = child.parent.children.filter((candidate) => candidate !== child);
        }
        child.parent = parent;
        parent.children.push(child);
      }
      parent.innerHTML = '';
    }
    return this;
  }

  attr(name, value) {
    if (typeof name === 'object') {
      for (const [attributeName, attributeValue] of Object.entries(name)) {
        this.attr(attributeName, attributeValue);
      }
      return this;
    }

    if (value === undefined) {
      return this.elements[0]?.attributes.get(name);
    }

    for (const element of this.elements) {
      element.attributes.set(name, String(value));
    }
    return this;
  }

  removeAttr(name) {
    for (const element of this.elements) {
      element.attributes.delete(name);
    }
    return this;
  }

  is(other) {
    return this.elements[0] === normalizeElements(other)[0];
  }

  prev() {
    return this.#adjacent(-1);
  }

  next() {
    return this.#adjacent(1);
  }

  #adjacent(offset) {
    const adjacent = [];
    for (const element of this.elements) {
      if (!element.parent) {
        continue;
      }
      const index = element.parent.children.indexOf(element);
      adjacent.push(element.parent.children[index + offset]);
    }
    return new JQueryCollection(adjacent.filter(Boolean), this.environment);
  }

  children(selector) {
    let children = this.elements.flatMap((element) => element.children);
    if (selector?.startsWith('.')) {
      const className = selector.slice(1);
      children = children.filter((element) => element.classes.has(className));
    }
    return new JQueryCollection(children, this.environment);
  }

  focus() {
    if (this.elements[0]) {
      this.environment.activeElement = this.elements[0];
    }
    return this;
  }

  stop(_clearQueue, jumpToEnd) {
    for (const element of this.elements) {
      if (!element.animation) {
        continue;
      }

      this.environment.clock.clearTimeout(element.animation.timerId);
      const callback = element.animation.callback;
      element.animation = null;
      if (jumpToEnd && callback) {
        callback();
      }
    }
    return this;
  }

  slideUp(duration, callback) {
    return this.#animate('none', duration, callback);
  }

  slideDown(duration, callback) {
    return this.#animate('block', duration, callback);
  }

  #animate(display, duration, callback) {
    for (const element of this.elements) {
      element.display = display;
      const timerId = this.environment.clock.setTimeout(() => {
        element.animation = null;
        callback?.();
      }, duration);
      element.animation = { callback, timerId };
    }
    return this;
  }
}

function normalizeElements(value) {
  if (value instanceof JQueryCollection) {
    return value.elements;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

function createEnvironment() {
  const clock = new FakeClock();
  const environment = {
    activeElement: null,
    childAttachTimeline: [],
    clock,
    newRunnableCalls: [],
    timeline: []
  };

  function jquery(value, properties) {
    if (typeof value === 'string' && value.startsWith('<')) {
      const match = value.match(/^<([a-zA-Z][\w-]*)/);
      if (!match) {
        throw new Error(`Unsupported element expression: ${value}`);
      }

      const element = new TestElement(match[1], environment);
      const collection = new JQueryCollection([element], environment);

      for (const [name, propertyValue] of Object.entries(properties ?? {})) {
        if (name === 'class') {
          collection.addClass(propertyValue);
        }
        else if (name === 'html') {
          element.innerHTML = String(propertyValue);
        }
        else if (name === 'on') {
          Object.assign(element.handlers, propertyValue);
        }
        else {
          collection.attr(name, propertyValue);
        }
      }

      return collection;
    }

    return new JQueryCollection(normalizeElements(value), environment);
  }

  jquery.extend = function (...sources) {
    return Object.assign(...sources);
  };

  function EventDispatcher() {
    this._listeners = Object.create(null);
    this._triggered = [];
  }

  EventDispatcher.prototype.on = function (type, listener) {
    (this._listeners[type] ??= []).push(listener);
  };

  EventDispatcher.prototype.trigger = function (event) {
    const normalized = typeof event === 'string' ? { type: event } : event;
    this._triggered.push(normalized);
    environment.timeline.push({ event: normalized, kind: 'event', source: this });
    for (const listener of this._listeners[normalized.type] ?? []) {
      listener.call(this, normalized);
    }
  };

  EventDispatcher.prototype.createXAPIEventTemplate = function (verb, extras) {
    return {
      type: 'xAPI',
      data: { statement: { verb, ...extras } },
      verb,
      extras
    };
  };

  const H5P = {
    EventDispatcher,
    jQuery: jquery,
    newRunnable(...args) {
      const child = {
        attachCount: 0,
        attach($container) {
          this.attachCount++;
          this.$container = $container;
          environment.childAttachTimeline.push({ child, isConnected: isConnected($container[0]) });
          environment.timeline.push({ child, kind: 'childAttach' });
        }
      };
      environment.newRunnableCalls.push({ args, child });
      return child;
    }
  };

  const context = vm.createContext({
    H5P,
    clearTimeout: clock.clearTimeout.bind(clock),
    console,
    setTimeout: clock.setTimeout.bind(clock)
  });

  vm.runInContext(fs.readFileSync(SOURCE_PATH, 'utf8'), context, {
    filename: SOURCE_PATH
  });

  environment.$ = jquery;
  environment.H5P = H5P;
  environment.Accordion = H5P.AccordionPapiJo;
  environment.createContainer = () => jquery(new TestElement('div', environment));
  environment.fire = (element, type, event = {}) => element.handlers[type]?.call(element, event);

  return environment;
}

function isConnected(element) {
  let current = element;
  while (current) {
    if (current.isDocumentRoot) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function panelParts(container, panelIndex) {
  const headings = container[0].children.filter((element) =>
    element.classes.has('h5p-panel-title')
  );
  const regions = container[0].children.filter((element) =>
    element.classes.has('h5p-panel-content')
  );
  const heading = headings[panelIndex];
  const region = regions[panelIndex];
  return {
    button: heading.children[0],
    heading,
    region
  };
}

function attachToDocument(environment, accordion) {
  const root = new TestElement('div', environment);
  root.isDocumentRoot = true;
  const container = environment.createContainer();
  environment.$(root).append(container);
  accordion.attach(container);
  return { container, root };
}

module.exports = {
  PROJECT_ROOT,
  attachToDocument,
  createEnvironment,
  panelParts
};
