"use strict";

var assert = typeof require == "function" && require("chai").assert ||
  window.chai.assert;
var flexo = typeof require == "function" && require("flexo") || window.flexo;

describe("Loading components", function () {

  var env;

  describe("bender.load_component([href | defaults[, env]])", function () {
    it("loads a component at href (if the first parameter is a string) in a new environment", function (done) {
      var p = bender.load_component("empty.xml");
      p.then(function (component) {
        assert.ok(component instanceof bender.Component);
        env = component.scope.$environment;
        done();
      }, done);
    });
    it("loads a component at defaults.href (if the first parameter is an object) in a new environment", function (done) {
      bender.load_component({ href: "empty.xml" }).then(flexo.discard(done), done);
    });
    it("uses the URL arguments if no defaults object is given", flexo.nop);
    it("creates a new environment for the current document is no environment argument is given", flexo.nop);
    it("uses the given environment otherwise", function (done) {
      var href = flexo.normalize_uri(document.baseURI, "empty.xml");
      var p = env.urls[href];
      assert.ok(p instanceof flexo.Promise);
      assert.ok(p.value instanceof bender.Component);
      bender.load_component(href, env).then(function (component) {
        assert.strictEqual(component, p.value);
        done();
      }, done);
    });
    it("returns the promise of a component which gets fulfilled once the component is loaded and fully deserialized", function (done) {
      var p = bender.load_component("empty.xml", env);
      assert.ok(p instanceof flexo.Promise);
      p.then(flexo.discard(done), done);
    });
    it("rejects the returned promise if no href parameter is given", function (done) {
      bender.load_component().then(done, flexo.discard(done));
    })
  });

  describe("bender.Environment.load_component(url)", function () {
    it("does the actual loading of the component at url", function (done) {
      var href = flexo.normalize_uri(document.baseURI, "empty.xml");
      var p = env.urls[href];
      env.load_component(href).then(function (component) {
        assert.strictEqual(component, p.value);
        done();
      }, done);
    });
    it("rejects the promise if loading fails with the message “XHR error”", function (done) {
      env.load_component(flexo.normalize_uri(document.baseURI, "nothing here"))
        .then(done, function (reason) {
          assert.strictEqual(reason.message, "XHR error");
          assert.ok("request" in reason);
          done();
        });
    });
    it("rejects the promise if the resource was loaded but is not a well-formed XML document", function (done) {
      env.load_component(flexo.normalize_uri(document.baseURI,
          "wrong-ill-formed.xml")).then(done, flexo.discard(done));
    });
    it("rejects the promise if an XML resource was loaded and parsed correctly but is not a Bender component", function (done) {
      env.load_component(flexo.normalize_uri(document.baseURI, "wrong-not-component.xml"))
        .then(done, function (reason) {
          assert.strictEqual(reason.message, "not a Bender component");
          assert.ok("response" in reason);
          done();
        });
    });
  });

});

describe("Deserialization", function () {
  var env = new bender.Environment;
  var doc = document.implementation.createDocument(bender.ns, "component",
    null);

  describe("bender.Environment.deserialize(node)", function () {
    it("deserializes an XML text node into a Bender text node", function () {
      var t = doc.createTextNode("test");
      var tt = env.deserialize(t);
      assert.ok(tt instanceof bender.DOMTextNode);
      assert.strictEqual(tt.text, "test");
    });
    it("deserializes an XML CDATA section into a Bender text node as well", function () {
      var t = doc.createCDATASection("<tags> & ampersands");
      var tt = env.deserialize(t);
      assert.ok(tt instanceof bender.DOMTextNode);
      assert.strictEqual(tt.text, "<tags> & ampersands");
    });
    it("skips anything else", function () {
      assert.strictEqual(env.deserialize(doc.createComment("skip this")));
      assert.strictEqual(env.deserialize(doc
          .createProcessingInstruction("xml-stylesheet",
            "href='bender.css' type='text/css'")));
    });
  });

  describe("bender.Environment.deserialize.component(elem, promise)", function () {
    it("deserializes a component from the given element elem", function (done) {
      env.deserialize(flexo.$("bender:component"))
        .then(function (component) {
          assert.ok(component instanceof bender.Component);
          assert.strictEqual(component.scope.$environment, env);
          assert.strictEqual(component.scope.$this, component);
          done();
        });
    });
    it("deserializes its prototype if the element has a href attribute", function (done) {
      env.deserialize(flexo.$("bender:component", { href: "empty.xml" }))
        .then(function (component) {
          assert.ok(component._prototype instanceof bender.Component);
          assert.ok(component._prototype != component);
          assert.ok(component._prototype.derived.indexOf(component) >= 0);
          done();
        });
    });
    it("deserializes its contents", function (done) {
      env.deserialize(flexo.$("bender:component", { href: "empty.xml" },
          flexo.$("bender:link", { rel: "stylesheet", href: "style.css" }),
          flexo.$("bender:view", "Hello!"))).then(function (component) {
          assert.strictEqual(component.links.length, 1);
          assert.ok(component.scope.$view instanceof bender.View);
        }).then(flexo.discard(done), done);
    });
    it("stores the component as soon as it is created in the promise so that a component can be referred to before it is completely deserialized", flexo.nop);
  });

  describe("bender.Environment.deserialize.link(elem)", function () {
    it("deserializes a link element", function () {
      var elem = doc.createElementNS(bender.ns, "link");
      var link = env.deserialize(elem);
      assert.ok(link instanceof bender.Link);
    });
    it("sets the rel property from the rel attribute", function () {
      var script = doc.createElementNS(bender.ns, "link");
      script.setAttribute("rel", " script\n");
      assert.strictEqual(env.deserialize(script).rel, "script");
      var stylesheet = doc.createElementNS(bender.ns, "link");
      stylesheet.setAttribute("rel", "\t  STYLEsheet\n");
      assert.strictEqual(env.deserialize(stylesheet).rel, "stylesheet");
    });
    it("sets the href property from the href attribute, resolving the URL from that of the component", function () {
      var script = doc.createElementNS(bender.ns, "link");
      script.setAttribute("rel", "script");
      script.setAttribute("href", "\nscript-1.js\n");
      assert.strictEqual(env.deserialize(script).rel, "script");
    });
  });

  describe("bender.Environment.deserialize.view(elem)", function () {
    it("deserializes a view element and its children", function (done) {
      env.deserialize(flexo.$("bender:view",
          flexo.$p("Hello there!"))).then(function (view) {
          assert.ok(view instanceof bender.View);
          assert.strictEqual(view.stack(), "top");
          assert.strictEqual(view.children.length, 1);
        }).then(flexo.discard(done), done);
    });
    it("deserializes and normalizes the stack attribute", function (done) {
      env.deserialize(flexo.$("bender:view", { stack: "REPLACE " },
          flexo.$p("Hello there!"))).then(function (view) {
          assert.ok(view instanceof bender.View);
          assert.strictEqual(view.stack(), "replace");
          assert.strictEqual(view.children.length, 1);
        }).then(flexo.discard(done), done);
    });
  });

  describe("bender.Environment.deserialize_foreign(elem)", function () {
    it("deserializes a foreign element (i.e., outside of the Bender namespace) elem", function (done) {
      var elem = doc.createElementNS(flexo.ns.html, "p");
      elem.setAttribute("class", "foo");
      env.deserialize_foreign(elem).then(function (p) {
        assert.ok(p instanceof bender.DOMElement);
        assert.strictEqual(p.ns, flexo.ns.html);
        assert.strictEqual(p.name, "p");
        assert.strictEqual(Object.keys(p.attrs).length, 1);
        assert.strictEqual(p.attrs[""].class, "foo");
        done();
      });
    });
    it("deserializes its contents as well", function (done) {
      var p = doc.createElementNS(flexo.ns.html, "p");
      p.appendChild(doc.createTextNode("test"));
      var q = doc.createElementNS(flexo.ns.html, "p");
      q.appendChild(doc.createTextNode("test again"));
      var div = doc.createElementNS(flexo.ns.html, "div");
      div.appendChild(doc.createComment("skip"));
      div.appendChild(p);
      div.appendChild(q);
      env.deserialize_foreign(div).then(function (div_) {
        assert.ok(div_ instanceof bender.DOMElement);
        assert.strictEqual(div_.ns, flexo.ns.html);
        assert.strictEqual(div_.name, "div");
        assert.strictEqual(div_.children.length, 2);
        assert.ok(div_.children[0] instanceof bender.DOMElement);
        assert.ok(div_.children[0].name, "p");
        assert.strictEqual(div_.children[1].children[0].text, "test again");
        done();
      });
    });
  });

});