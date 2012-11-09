(function (bender) {
  "use strict";

  var K = 0;  // counter for placeholders (debug)

  var A = Array.prototype;

  // The Bender namespace, also adding the "bender" namespace prefix for
  // flexo.create_element
  bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";

  // Create a rendering contest given a target element in a host document (using
  // the document element as a default.)
  bender.create_context = function (target) {
    target = target || document.documentElement;
    var host_doc = target.ownerDocument;
    var context = host_doc.implementation.createDocument(bender.ns, "context",
      null);
    context._uri = host_doc.baseURI;

    // Wrap all new elements created in this context
    context.createElement = function (name) {
      return wrap_element(Object.getPrototypeOf(this).createElementNS.call(this,
            bender.NS, name));
    };
    context.createElementNS = function (ns, qname) {
      return wrap_element(Object.getPrototypeOf(this).createElementNS.call(this,
            ns, qname));
    };

    // Read-only target property
    Object.defineProperty(context, "_target", {
      enumerable: true,
      get: function () {
        return target;
      }
    });

    // Add an instance to the context; it now becomes live. Return the added
    // instance.
    context._add_instance = function (instance) {
      return this.documentElement.appendChild(instance);
    };

    // Loaded files by URI. When a file is being loaded, store all instances
    // that are requesting it; once it's loaded, store the loaded component
    var loaded = {};
    loaded[flexo.normalize_uri(context._uri, "")] = context.documentElement;

    // Load the component at the given URI for the instance
    context._load_component = function (uri, instance) {
      var split = uri.split("#");
      var locator = flexo.normalize_uri(instance._uri, split[0]);
      // var id = split[1];
      if (loaded[locator] instanceof window.Node) {
        flexo.notify(instance, "@loaded", { uri: locator,
          component: loaded[locator] });
      } else if (Array.isArray(loaded[locator])) {
        loaded[locator].push(instance);
      } else {
        loaded[locator] = [instance];
        flexo.ez_xhr(locator, { responseType: "document" }, function (req) {
          var ev = { uri: locator, req: req };
          if (req.status !== 0 && req.status !== 200) {
            ev.message = "HTTP error {0}".fmt(req.status);
            flexo.notify(instance, "@error", ev);
          } else if (!req.response) {
            ev.message = "could not parse response as XML";
            flexo.notify(instance, "@error", ev);
          } else {
            var c = context._import_node(req.response.documentElement, locator);
            if (is_bender_element(c, "component")) {
              ev.component = c;
              loaded[locator].forEach(function (i) {
                flexo.notify(i, "@loaded", ev);
              });
              loaded[locator] = c;
            } else {
              ev.message = "not a Bender component";
              flexo.notify(instance, "@error", ev);
            }
          }
        });
      }
    };

    // Import a node in the context (for loaded components)
    context._import_node = function (node, uri) {
      if (node.nodeType === window.Node.ELEMENT_NODE) {
        var n = this.createElementNS(node.namespaceURI, node.localName);
        if (is_bender_element(n, "component")) {
          n._uri = uri;
        }
        A.forEach.call(node.attributes, function (attr) {
          if (attr.namespaceURI) {
            if (attr.namespaceURI === flexo.ns.xmlns &&
                attr.localName !== "xmlns") {
              n.setAttribute("xmlns:" + attr.localName, attr.nodeValue);
            } else {
              n.setAttributeNS(attr.namespaceURI, attr.localName,
                attr.nodeValue);
            }
          } else {
            n.setAttribute(attr.localName, attr.nodeValue);
          }
        });
        A.forEach.call(node.childNodes, function (ch) {
          var ch_ = this._import_node(ch, uri);
          if (ch_) {
            n.appendChild(ch_);
          }
        }, this);
        return n;
      }
      if (node.nodeType === window.Node.TEXT_NODE ||
          node.nodeType === window.Node.CDATA_SECTION_NODE) {
        return this.createTextNode(node.textContent)
      }
    };

    context.$ = flexo.create_element.bind(context);
    var view = wrap_element(context.documentElement);
    view._target = target;
    return context;
  };


  // Bender elements overload some DOM methods in order to track changes to the
  // tree.

  var prototypes = {
    // Default overloaded DOM methods for Bender elements
    "": {
      // Make sure that an overloaded insertBefore() is called for appendChild()
      appendChild: function (ch) {
        return this.insertBefore(ch, null);
      },
    }
  };

  ["component", "context", "instance", "view"].forEach(function (p) {
    prototypes[p] = {};
  });


  // Component methods

  prototypes.component._init = function () {
    this._properties = [];  // all the property elements for this component
    this._watches = [];     // all the watch elements fro this component
    this._instances = [];   // live instances of this componet
  };

  // Convenience method to create a new instance of that component
  prototypes.component._create_instance = function () {
    var instance = this.ownerDocument.$("instance");
    instance._component = this;
    return instance;
  };

  prototypes.component.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "view") {
        if (this._view) {
          console.error("Multiple views for component", this);
        } else {
          this._view = ch;
          this._view._set_uri_for_instances(this._uri);
        }
      } else if (ch.localName === "property") {
        this._properties.push(ch);
      } else if (ch.localName === "watch") {
        this._watches.push(ch);
      }
    }
    return ch;
  };

  prototypes.component.removeChild = function (ch) {
    if (ch.namespaceURI === bender.ns) {
      if (ch.localName === "view") {
        if (this._view === ch) {
          delete this._view;
          this._instances.forEach(function (instance) {
            // TODO unrender?
          });
        }
      } else if (ch.localName === "property") {
        flexo.remove_from_array(this._properties, ch);
      } else if (ch.localName === "watch") {
        flexo.remove_from_array(this._watches, ch);
      }
    }
    Object.getPrototypeOf(this).removeChild.call(this, ch);
    return ch;
  };


  // Context methods

  // Add instances to the context and render them in the context target
  prototypes.context.insertBefore = function (ch, ref) {
    if (is_bender_element(ch, "instance")) {
      Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
      ch._uri = this.ownerDocument._uri;
      var placeholder = ch._render(this._target);
      this._target.insertBefore(placeholder, ref && ref._placeholder);
      return ch;
    } else {
      console.warn("Unexpected element in context:", ch);
    }
  };

  prototypes.context.removeChild = function (ch) {
    if (is_bender_element(ch, "instance")) {
      // TODO unrender
    }
    Object.getPrototypeOf(this).removeChild.call(this, ch);
    return ch;
  };


  // Instance methods
  // Status of an instance:
  //   ._uri: base URI; if not set, then it is not in the tree
  //   ._href: has a reference to a component
  //   ._component: if set, then loaded; otherwise, not ready
  //   ._target: has a target to render into

  prototypes.instance._init = function (component) {
    this._children = [];
    // Set the component: instantiate and render it (it is already loaded)
    Object.defineProperty(this, "_component", { enumerable: true,
      get: function () { return component; },
      set: function (c) {
        if (component !== c) {
          component = c;
        }
      }
    });
  };

  prototypes.instance._render = function (target) {
    console.log("instance._render(): placeholder #{0}".fmt(K));
    this._placeholder = target.ownerDocument.createElementNS(bender.ns,
        "placeholder");
    this._placeholder.setAttribute("no", K++);
    this._placeholder._instance = this;
    var render = function () {
      if (this._component._view) {
        render_children(this._component._view, this._placeholder);
      }
    };
    if (this._component) {
      render.call(this);
    } else {
      this._load_component(render);
    }
    return this._placeholder;
  };

  prototypes.instance._load_component = function (k) {
    if (this._uri && this._href && !this._component) {
      flexo.listen_once(this, "@loaded", function (e) {
        e.source._component = e.component;
        k.call(e.source);
      });
      flexo.listen_once(this.ownerDocument, "@error", function (e) {
        console.error("Error loading component at {0}: {1}"
          .fmt(e.uri, e.message), e.source);
      });
      this.ownerDocument._load_component(this._href, this);
    }
  };

  prototypes.instance._add_child_instance = function(template) {
    var instance = this.ownerDocument.$("instance");
    instance._template = template;
    instance._parent = this;
    this._children.push(instance);
    instance._uri = template._uri;
    instance._href = template._href;
    instance._component = template._component;
    return instance;
  };

  prototypes.instance.setAttribute = function (name, value) {
    Object.getPrototypeOf(this).setAttribute.call(this, name, value);
    if (name === "href") {
      this._href = value;
    }
  };

  prototypes.instance.insertBefore = prototypes.component.insertBefore;

  function render_children(view, target) {
    A.forEach.call(view.childNodes, function (ch) {
      if (ch.nodeType === window.Node.ELEMENT_NODE) {
        if (ch.namespaceURI === bender.ns) {
          if (ch.localName === "instance") {
            var instance = instance_of(target);
            var child_instance = instance._add_child_instance(ch);
            target.appendChild(child_instance._render(target));
          } else if (ch.localName === "content") {
            var instance = instance_of(target);
            if (instance._template) {
              instance = instance._template;
            }
            if (instance.childNodes.length > 0) {
              render_children(instance, target);
            } else {
              render_children(ch, target);
            }
          } else {
            console.warn("Unexpected Bender element {0} in view; skipped."
              .fmt(ch.localName));
          }
        } else {
          var t = target.appendChild(
            target.ownerDocument.createElementNS(ch.namespaceURI,
              ch.localName));
          A.forEach.call(ch.attributes, function (attr) {
            t.setAttributeNS(attr.namespaceURI, attr.localName, attr.value);
          });
          render_children(ch, t);
        }
      } else if (ch.nodeType === window.Node.TEXT_NODE ||
        ch.nodeType === window.Node.CDATA_SECTION_NODE) {
        var t = target.appendChild(
          target.ownerDocument.createTextNode(ch.textContent));
      }
    });
  }


  // View methods

  prototypes.view.insertBefore = function (ch, ref) {
    Object.getPrototypeOf(this).insertBefore.call(this, ch, ref);
    if (!is_bender_element(ch)) {
      return wrap_element(ch, prototypes.view);
    }
  };

  prototypes.view._set_uri_for_instances = function (uri) {
    A.forEach.call(this.childNodes, function (ch) {
      if (is_bender_element(ch, "instance")) {
        ch._uri = uri;
      } else if (typeof ch._set_uri_for_instances === "function") {
        ch._set_uri_for_instances(uri);
      }
    });
  };


  // Utility functions

  // Find the nearest instance ancestor for this element (may be undefined, for
  // instance if the element is not rooted)
  function instance_of(elem) {
    if (is_bender_element(elem, "instance")) {
      return elem;
    } else if (is_bender_element(elem, "placeholder")) {
      return elem._instance;
    } else if (elem) {
      return instance_of(elem.parentNode);
    }
  }

  // Test whether the given node is an element in the Bender namespace with the
  // given name
  function is_bender_element(node, name) {
    return node instanceof window.Node &&
      node.nodeType === window.Node.ELEMENT_NODE &&
      node.namespaceURI === bender.ns &&
      (name === undefined || node.localName === name);
  }

  // Extend an element with Bender methods, calls its _init() method, and return
  // the wrapped element.
  function wrap_element(e, proto) {
    if (typeof proto !== "object") {
      proto = prototypes[e.localName];
    }
    if (proto) {
      for (var p in proto) {
        if (proto.hasOwnProperty(p)) {
          e[p] = proto[p];
        }
      }
    }
    for (p in prototypes[""]) {
      if (prototypes[""].hasOwnProperty(p) && !e.hasOwnProperty(p)) {
        e[p] = prototypes[""][p];
      }
    }
    if (typeof e._init === "function") {
      e._init();
    }
    return e;
  }

}(window.bender = {}))
