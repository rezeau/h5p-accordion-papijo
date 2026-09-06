/**
 * Accordion module
 *
 * @param {jQuery} $
 */
H5P.AccordionPapiJo = (function ($) {

  var nextIdPrefix = 0;
  var nextLooperId = 0;
  var allowedLoopers = [];
  /**
   * Initialize a new Accordion
   *
   * @class H5P.InteractiveVideo
   * @extends H5P.EventDispatcher
   * @param {Object} params Behavior settings
   * @param {Number} contentId Content identification
   * @param {Object} contentData Object containing task specific content data
   */
  function Accordion(params, contentId, contentData) {
    this.contentId = contentId;
    H5P.EventDispatcher.call(this);

    // Set default behavior.
    this.params = $.extend({}, {
      hTag: "h2",
      panels: []
    }, params);

    this.contentData = contentData;

    this.instances = [];

    for (var i = 0; i < this.params.panels.length; i++) {
      this.instances[i] = H5P.newRunnable(this.params.panels[i].content, contentId);
    }

    this.idPrefix = (nextIdPrefix++) + '-';
  }

  Accordion.prototype = Object.create(H5P.EventDispatcher.prototype);
  Accordion.prototype.constructor = Accordion;

  /**
   * Append field to wrapper.
   * @param {jQuery} container the jQuery object which this module will attach itself to.
   */
  Accordion.prototype.attach = function ($container) {
    var self = this;

    if (self.$content === undefined) {
      // Mark as consumed
      self.triggerConsumed();

      // Create the content
      self.elements = [];
      self.panelElements = [];
      if (
        self.params.panels.length > 1 &&
        typeof self.params.accordionTitle === 'string' &&
        self.params.accordionTitle.trim() !== ''
      ) {
        self.createNavigation(self.params.accordionTitle.trim());
      }
      for (var i = 0; i < self.params.panels.length; i++) {
        self.createPanel(i);
      }
      self.$content = $(self.elements);
    }

    // Insert content
    $container.html('').addClass('h5p-accordion-papijo h5p-theme').append(self.$content);
  };

  /**
   * Create HTML for Panel.
   * @param {number} id
   */
  Accordion.prototype.createPanel = function (id) {
    var self = this;
    var titleId = 'h5p-panel-link-' + this.idPrefix + id;
    var buttonId = 'h5p-panel-button-' + this.idPrefix + id;
    var contentId = 'h5p-panel-content-' + self.idPrefix + id;

    var toggleCollapse = function () {
      if (self.$expandedTitle === undefined || !self.$expandedTitle.is($title)) {
        self.collapseExpandedPanels();
        self.expandPanel($title, $titleButton, $content);
        if (self.$navigation !== undefined) {
          self.setCompactSelection(id);
        }
      }
      else {
        self.collapsePanel($title, $titleButton, $content);
        if (self.$navigation !== undefined) {
          self.clearCompactSelection();
        }
      }

      // We're running in an iframe, so we must animate the iframe height
      self.animateResize();
    };
    
    // Create panel title
    var $title =  $('<' + this.params.hTag + '/>', {
      'id': titleId,
      'class': 'h5p-panel-title',
    });
    if (self.$navigation !== undefined) {
      $title.attr('hidden', 'hidden');
    }

    // Create panel button
    var $titleButton =  $('<button/>', {
      'id': buttonId,
      'class': 'h5p-panel-button',
      'tabindex': '0',
      'aria-expanded': 'false',
      'aria-controls': contentId,
      'html': self.params.panels[id].title,
      'on': {
        'click': toggleCollapse,
        'keydown': function (event) {
          switch (event.keyCode) {
            case 38:   // Up
            case 37: { // Left
              // Try to select previous item
              var $prev = $title.prev().prev().children('.h5p-panel-button');
              if ($prev.length) {
                $prev.focus();
              }
              return false;
            }
            case 40:   // Down
            case 39: { // Right
              // Try to select next item
              var $next = $content.next().children('.h5p-panel-button');
              if ($next.length) {
                $next.focus();
              }
              return false;
            }

            case 32:   // SPACE
            case 13: { // ENTER
              toggleCollapse();
              return false;
            }
          }
        },
      }
    });

    $title.append($titleButton);

    // Create panel content
    var $content = $('<div>', {
      'id': contentId,
      'class': 'h5p-panel-content',
      'role': 'region',
      'aria-labelledby': buttonId,
      'aria-hidden': 'true'
    });

    // Add the content itself to the content section
    self.instances[id].attach($content);

    // Gather all content
    self.elements.push($title[0]);
    self.elements.push($content[0]);
    self.panelElements[id] = {
      $title: $title,
      $titleButton: $titleButton,
      $content: $content
    };
  };

  /**
   * Create compact navigation for selecting a panel.
   *
   * @param {string} title Navigation disclosure label
   */
  Accordion.prototype.createNavigation = function (title) {
    var self = this;
    var toggleId = 'h5p-accordion-navigation-toggle-' + self.idPrefix;
    var listId = 'h5p-accordion-navigation-list-' + self.idPrefix;

    self.$navigationItems = [];

    self.$navigationToggle = $('<button/>', {
      'id': toggleId,
      'class': 'h5p-accordion-papijo-navigation-toggle',
      'type': 'button',
      'aria-expanded': 'false',
      'aria-controls': listId,
      'html': title,
      'on': {
        'click': function () {
          if (self.$navigationToggle.attr('aria-expanded') === 'true') {
            self.closeNavigation();
          }
          else {
            self.openNavigation();
          }
        }
      }
    });

    self.$navigationList = $('<ul/>', {
      'id': listId,
      'class': 'h5p-accordion-papijo-navigation-list',
      'aria-labelledby': toggleId,
      'hidden': 'hidden',
      'on': {
        'keydown': function (event) {
          if (event.key === 'Escape' || event.keyCode === 27) {
            event.preventDefault();
            self.closeNavigation(true);
          }
        }
      }
    });

    for (var i = 0; i < self.params.panels.length; i++) {
      self.createNavigationItem(i);
    }

    self.$navigation = $('<div/>', {
      'class': 'h5p-accordion-papijo-navigation'
    })
      .append(self.$navigationToggle)
      .append(self.$navigationList);

    self.elements.push(self.$navigation[0]);
  };

  /**
   * Add an item to the compact panel navigation.
   *
   * @param {number} id Panel index
   */
  Accordion.prototype.createNavigationItem = function (id) {
    var self = this;
    var $button = $('<button/>', {
      'class': 'h5p-accordion-papijo-navigation-item',
      'type': 'button',
      'html': self.params.panels[id].title,
      'on': {
        'click': function () {
          self.selectPanel(id);
        }
      }
    });
    var $item = $('<li/>', {
      'class': 'h5p-accordion-papijo-navigation-list-item'
    }).append($button);

    self.$navigationList.append($item);
    self.$navigationItems[id] = $button;
  };

  /**
   * Open the compact navigation.
   */
  Accordion.prototype.openNavigation = function () {
    this.$navigationToggle.attr('aria-expanded', true);
    this.$navigationList.removeAttr('hidden');
    this.trigger('resize');
  };

  /**
   * Close the compact navigation.
   *
   * @param {boolean} focusToggle Whether focus should return to the disclosure
   */
  Accordion.prototype.closeNavigation = function (focusToggle) {
    var panelWasOpen = this.$expandedTitle !== undefined;

    if (panelWasOpen) {
      this.collapsePanel(this.$expandedTitle, this.$expandedButton, this.$expandedPanel);
      this.clearCompactSelection();
    }

    this.$navigationToggle.attr('aria-expanded', false);
    this.$navigationList.attr('hidden', 'hidden');
    if (focusToggle) {
      this.$navigationToggle.focus();
    }
    this.trigger('resize');
    if (panelWasOpen) {
      this.animateResize();
    }
  };

  /**
   * Explicitly open a panel selected through the compact navigation.
   *
   * @param {number} id Panel index
   */
  Accordion.prototype.selectPanel = function (id) {
    var panel = this.panelElements[id];

    if (this.$expandedTitle === undefined || !this.$expandedTitle.is(panel.$title)) {
      this.collapseExpandedPanels();
      this.expandPanel(panel.$title, panel.$titleButton, panel.$content);
    }

    this.setCompactSelection(id);
    panel.$titleButton.focus();
    this.animateResize();
  };

  /**
   * Show and mark the panel selected through compact navigation.
   *
   * @param {number} id Panel index
   */
  Accordion.prototype.setCompactSelection = function (id) {
    for (var i = 0; i < this.panelElements.length; i++) {
      if (i === id) {
        this.panelElements[i].$title.removeAttr('hidden');
        this.$navigationItems[i]
          .addClass('h5p-accordion-papijo-navigation-item-selected')
          .attr('aria-current', true);
      }
      else {
        this.panelElements[i].$title.attr('hidden', 'hidden');
        this.$navigationItems[i]
          .removeClass('h5p-accordion-papijo-navigation-item-selected')
          .removeAttr('aria-current');
      }
    }
  };

  /**
   * Clear compact selection when no panel is open.
   */
  Accordion.prototype.clearCompactSelection = function () {
    for (var i = 0; i < this.panelElements.length; i++) {
      this.panelElements[i].$title.attr('hidden', 'hidden');
      this.$navigationItems[i]
        .removeClass('h5p-accordion-papijo-navigation-item-selected')
        .removeAttr('aria-current');
    }
  };

  /**
   * Trigger the 'consumed' xAPI event when this commences
   *
   * (Will be more sophisticated in future version)
   */
  Accordion.prototype.triggerConsumed = function () {
    var xAPIEvent = this.createXAPIEventTemplate({
      id: 'http://activitystrea.ms/schema/1.0/consume',
      display: {
        'en-US': 'consumed'
      }
    }, {
      result: {
        completion: true
      }
    });
    this.trigger(xAPIEvent);
  };

  /**
   * Collapse all expanded panels
   */
  Accordion.prototype.collapseExpandedPanels = function () {
    var self = this;
    if (this.$expandedTitle !== undefined) {
      this.$expandedButton.attr('aria-expanded', false);
      this.$expandedTitle.removeClass('h5p-panel-expanded');
    }
    if (this.$expandedPanel !== undefined) {
      this.$expandedPanel
        .stop(false, true)
        .slideUp(200, function () {
          self.stopWorkLoop(self.resizing);
          self.trigger('resize');
        })
        .attr('aria-hidden', true);
    }
  };

  /**
   * Expand a panel
   *
   * @param {jQuery} $title The title of the panel that is to be expanded
   * @param {jQuery} $panel The panel that is to be expanded
   */
  Accordion.prototype.expandPanel = function($title, $titleButton, $panel) {
    var self = this;

    $titleButton.attr('aria-expanded', true);
    $title.addClass('h5p-panel-expanded');

    $panel
      .stop(false, true)
      .slideDown(200, function () {
        self.stopWorkLoop(self.resizing);
        self.trigger('resize');
      })
      .attr('aria-hidden', false);

    self.$expandedButton = $titleButton;
    self.$expandedTitle = $title;
    self.$expandedPanel = $panel;
  };

  /**
   * Collapse a panel
   *
   * @param {jQuery} $title The title of the panel that is to be collapsed
   * @param {jQuery} $panel The panel that is to be collapsed
   */
  Accordion.prototype.collapsePanel = function($title, $titleButton, $panel) {
    var self = this;
    $titleButton.attr('aria-expanded', false)
    $title.removeClass('h5p-panel-expanded');
    $panel
      .stop(false, true)
      .slideUp(200, function () {
        self.stopWorkLoop(self.resizing);
        self.trigger('resize');
      })
      .attr('aria-hidden', true);
     self.$expandedTitle = self.$expandedButton = self.$expandedPanel = undefined;
  };

  /**
   * Makes sure that the heigt of the iframe gets animated
   */
  Accordion.prototype.animateResize = function () {
    var self = this;
    self.stopWorkLoop(this.resizing);
    this.resizing = self.startWorkLoop(function () {
      self.trigger('resize');
    }, 40);
  };

  Accordion.prototype.startWorkLoop = function (func, wait) {
    var myId = nextLooperId++;
    var self = this;
    allowedLoopers.push(myId);
    var looper = function(func, wait, myId) {
      return function () {
        if (self.allowedToWork(myId)) {
          try {
            func.call(null);
          }
          catch (e) {
            self.stopWorkLoop(myId);
          }
          setTimeout(looper, wait, func, wait, myId);
        }
      };
    } (func, wait, myId);
    setTimeout(looper, wait);
    return myId;
  };

  Accordion.prototype.stopWorkLoop = function (myId) {
    var index;
    while ((index = allowedLoopers.indexOf(myId)) !== -1) {
      allowedLoopers.splice(index, 1);
    }
  };

  Accordion.prototype.allowedToWork = function (myId) {
    return allowedLoopers.indexOf(myId) !== -1;
  };

  return Accordion;
})(H5P.jQuery);
