// Minimal implementation of the data/rendering model of Bender (without XML
// serialization, syntactic sugar, &c.)

/* global bender, console, exports, flexo, global, require, window */
// jshint -W097

"use strict";

if (typeof window === "object") {
  window.bender = {};
} else {
  global.flexo = require("flexo");
  global.bender = exports;
}

bender.VERSION = "0.9.m";
bender.ns = flexo.ns.bender = "http://bender.igel.co.jp";


bender.Node = {
  init: function () {
    this.children = [];
    return this;
  },

  clone: function () {
    var clone = Object.create(this);
    clone.children = this.children.map(function (child) {
      var child_ = child.clone();
      child_.parent = clone;
      return child_;
    });
    return clone;
  },

  id: function (id) {
    if (arguments.length === 0) {
      return this._id || "";
    }
    var _id = flexo.check_xml_id(id);
    // jshint -W041
    if (_id == null) {
      console.warn("“%0” is not a valid XML ID".fmt(id));
    } else if (_id === "this") {
      console.warn("“this” is a reserved ID");
    } else {
      this._id = _id;
      if (_id) {
        var scope = Object.getPrototypeOf(this.scope || this.component.scope);
        scope["#" + _id] = this;
        scope["@" + _id] = this;
      }
    }
    return this;
  },

  add_child: function (child) {
    this.children.push(child);
    child.parent = this;
    return child;
  }
};


bender.Component = flexo._ext(bender.Node, {
  init: function () {
    this.property_definitions = this.property_definitions ?
      Object.create(this.property_definitions) : {};
    this.properties = this.properties ? Object.create(this.properties) : {};
    this.view = Object.create(bender.View).init();
    Object.defineProperty(this.view, "component", { enumerable: true,
      value: this });
    this.watches = [];
    this.set_scope({});
    return bender.Node.init.call(this);
  },

  clone: function () {
    var clone = bender.Node.clone.call(this);
    clone.view = this.view.clone();
    return clone;
  },

  add_child: function (child) {
    var scope = Object.getPrototypeOf(this.scope);
    Object.keys(Object.getPrototypeOf(child.scope)).forEach (function (id) {
      scope[id] = child.scope[id];
    });
    child.set_scope(scope);
    return bender.Node.add_child.call(this, child);
  },

  set_scope: function (scope) {
    this.scope = Object.create(scope, {
      "#this": { value: this, enumerable: true },
      "@this": { value: this, enumerable: true }
    });
  },

  add_property: function (name) {
    var property = Object.create(bender.Property).init(name, this);
    this.property_definitions[name] = property;
    return property;
  },

  add_watch: function (watch) {
    this.watches.push(watch, this);
    watch.component = this;
    return watch;
  },

  render: function (target) {
    var stack = this.stack_views();
    stack[0].render(stack, 0, target);
  },

  stack_views: function () {
    var prototype = this.prototype;
    var stack = prototype ? prototype.stack_views() : [];
    var view = this.view.clone();
    view.stack = stack;
    stack.push(view);
    return stack;
  }
});

flexo.make_readonly(bender.Component, "prototype", function () {
  var prototype = Object.getPrototypeOf(this);
  if (prototype !== bender.Component) {
    return prototype;
  }
});


bender.Adaptor = {
  init: flexo.self
};

flexo._accessor(bender.Adaptor, "select", function (select) {
  return flexo.safe_trim(select) || "@this";
});
flexo._accessor(bender.Adaptor, "match", flexo.funcify(true), true);
flexo._accessor(bender.Adaptor, "value", flexo.snd, true);
flexo._accessor(bender.Adaptor, "delay", function (delay) {
  var d = flexo.to_number(delay);
  if (d >= 0) {
    return d;
  }
});


bender.Property = flexo._ext(bender.Adaptor, {
  init: function (name, component) {
    this.name = name;
    this.component = component;
    return bender.Adaptor.init.call(this);
  }
});

flexo._accessor(bender.Property, "select", function (select) {
  return flexo.safe_trim(select) === "#this" ? "#this" : "@this";
});


bender.Element = flexo._ext(bender.Node, {
});

flexo.make_readonly(bender.Element, "component", function () {
  return this.parent && this.parent.component;
});


bender.View = flexo._ext(bender.Element, {
  render: function (stack, index, target) {
    if (this.stack === stack) {
      this.render_children(stack, index, target);
    } else {
      this.component.clone().render(stack, index, target);
    }
  },

  render_children: function (stack, index, target) {
    var fragment = target.ownerDocument.createDocumentFragment();
    this.children.forEach(function (child) {
      child.render(stack, index, fragment);
    });
    target.appendChild(fragment);
  }
});


bender.Content = flexo._ext(bender.View, {
  render: function (stack, index, target) {
    for (var i = index + 1, n = stack.length;
      i < n && stack[i].children.length === 0; ++i) {}
    if (i < n) {
      stack[i].render(stack, i, target);
    } else {
      this.render_children(stack, index, target);
    }
  }
});


bender.DOMElement = flexo._ext(bender.Element, {
  init: function (ns, name, attrs) {
    this.ns = flexo.safe_string(ns);
    this.name = flexo.safe_string(name);
    this.attrs = attrs || {};
    return bender.Element.init.call(this);
  },

  attr: function (ns, name, value) {
    if (arguments.length === 2) {
      return this.attrs[ns] && this.attrs[ns][name];
    }
    if (!this.attrs[ns]) {
      this.attrs[ns] = {};
    }
    this.attrs[ns][name] = value;
    return this;
  },

  render: function (stack, index, target) {
    this.rendered = target.appendChild(target.ownerDocument
      .createElementNS(this.ns, this.name));
    for (var ns in this.attrs) {
      for (var name in this.attrs[ns]) {
        this.rendered.setAttributeNS(ns, name, this.attrs[ns][name]);
      }
    }
    this.children.forEach(function (child) {
      child.render(stack, index, this.rendered);
    }, this);
  }
});


bender.Attribute = flexo._ext(bender.Element, {
  init: function (ns, name) {
    this.ns = flexo.safe_string(ns);
    this.name = flexo.safe_string(name);
    return bender.Element.init.call(this);
  },

  render: function (stack, index, target) {
    this.target = target;
    this.target.setAttributeNS(this.ns, this.name,
      this.children.reduce(function (text, child) {
        return text + (typeof child.text === "function" ? child.text() : "");
      }, ""));
  }
});


bender.Text = flexo._ext(bender.Element, {
  render: function (stack, index, target) {
    this.rendered = target.appendChild(target.ownerDocument.createTextNode());
    this.rendered.textContent = this.text();
  }
});

flexo._accessor(bender.Text, "text", function (text) {
  return flexo.safe_string(text);
});


bender.Watch = {
  init: function (component) {
    this.component = component;
    this.gets = [];
    this.sets = [];
    return this;
  },

  add_get: function (get) {
    this.gets.push(get);
    get.watch = this;
    return get;
  },

  add_set: function (set) {
    this.sets.push(set);
    set.watch = this;
    return set;
  },

  render: function () {
    var w = Object.create(bender.WatchVertex).init(this);
    this.gets.forEach(function (get) {
      // TODO
    });
  }
};


bender.Get = flexo._ext(bender.Adaptor, {
});

bender.GetProperty = flexo._ext(bender.Get, {
  init: function (name) {
    this.name = flexo.safe_string(name);
    return bender.Get.init.call(this);
  }
});

bender.GetProperty = flexo._ext(bender.Get, {
  init: function (type) {
    this.type = flexo.safe_string(type);
    return bender.Get.init.call(this);
  }
});


bender.Set = flexo._ext(bender.Adaptor, {
});

bender.SetProperty = flexo._ext(bender.Set, {
  init: function (name) {
    this.name = flexo.safe_string(name);
    return bender.Set.init.call(this);
  }
});

bender.SetAttribute = flexo._ext(bender.Set, {
  init: function (ns, name) {
    this.ns = flexo.safe_string(ns);
    this.name = flexo.safe_string(name);
    return bender.Set.init.call(this);
  }
});

bender.SetEvent = flexo._ext(bender.Set, {
  init: function (type) {
    this.type = flexo.safe_string(type);
    return bender.Set.init.call(this);
  }
});


bender.Vertex = {
  init: function () {
    this.incoming = [];
    this.outgoing = [];
    return this;
  },

  add_outgoing: function (edge) {
    this.outgoing.push(edge);
    edge.source = this;
    return edge;
  }
};


bender.Vortex = flexo._ext(bender.Vertex);

bender.WatchVertex = flexo._ext(bender.Vertex, {
  init: function (watch) {
    this.watch = watch;
    return bender.Vertex.init.call(this);
  }
});
