(function (assert, flexo, bender) {
  "use strict";

  describe("Bender namespace ({0})".fmt(bender.ns), function () {
    it("extends flexo to create elements in the Bender namespace with the \"bender\" prefix", function () {
      var app = flexo.$("bender:component");
      assert.strictEqual(app.namespaceURI, bender.ns);
      assert.strictEqual(app.localName, "component");
    });
  });


  var context = bender.create_context(flexo.$div());
  var component = context.$("component");
  var instance = component._create_instance();

  describe("Bender context", function () {

    it("bender.create_context() creates a new Bender context, which is a document that will contain instances", function () {
      assert.ok(context instanceof window.Document);
      assert.strictEqual(context.documentElement.namespaceURI, bender.ns);
      assert.strictEqual(context.documentElement.localName, "context");
    });

    it("$() is a binding of flexo.create_element to a context", function () {
      assert.strictEqual(component.ownerDocument, context);
      assert.strictEqual(component.namespaceURI, bender.ns);
      assert.strictEqual(component.localName, "component");
    });

    describe("context._add_instance(instance)", function () {

      it("adds instance to the the context to be rendered in its target", function () {
        var ch = context._add_instance(instance);
        assert.strictEqual(instance, ch, "added instance is returned");
        assert.strictEqual(instance, context.querySelector("instance"),
          "instance was added to the context");
      });

      it("does not add any other type of element", function () {
        var ch = context._add_instance(context.$("foo"));
        assert.isUndefined(ch, "nothing is returned");
        assert.isNull(context.querySelector("foo"),
          "unexpected element not added to the context");
      });
    });
  });

  describe("Components and instances", function () {

    it("Create a new instance of a component with component._create_instance()", function () {
      assert.strictEqual(instance.namespaceURI, bender.ns);
      assert.strictEqual(instance.localName, "instance");
      assert.strictEqual(instance._component, component);
    });

    var v = context.$("view");

    it("Component may have a single <view> child", function () {
      component.appendChild(v);
      assert.strictEqual(component._view, v);
    });

    var w = context.$("view");

    it("Adding more views has no effect (but generates a warning)", function () {
      component.appendChild(w);
      assert.strictEqual(component._view, v);
    });

    it("Removing the view", function () {
      component.removeChild(w);
      assert.strictEqual(component._view, v);
      component.removeChild(v);
      assert.strictEqual(component._view);
      assert.strictEqual(component.querySelector("view"), null);
    });

    it("Instance of the component are updated when the view changes");

    it("Instances can refer to components through their URI; the files are loaded if necessary", function (done) {
      var hello = context.$("instance", { href: "../t/dummy.xml" });
      var handler = function (e) {
        setTimeout(function () {
          assert.strictEqual(e.type, "@loaded",
            "component loaded without error");
          assert.strictEqual(e.component, hello._component,
            "component set for instance");
          assert.instanceOf(hello._component, window.Element,
            "loaded component is a DOM element");
          assert.instanceOf(hello._component._view, window.Element,
            "loaded component has a view");
          done();
        }, 0);
      };
      flexo.listen(hello, "@loaded", handler);
      flexo.listen(hello, "@error", handler);
      context.documentElement.appendChild(hello);
    });

  });

  describe("Rendering", function () {

    describe("Simple rendering from an in-memory component", function() {

      var div = flexo.$div();
      var context = bender.create_context(div);
      var text = "Hello, world!";
      var hello = context.documentElement.appendChild(
        context.$("component",
          context.$("view",
            context.$("html:p", text)))._create_instance());

      it("Hello world!", function () {
        assert.strictEqual(
          context.querySelector("instance")._placeholder.textContent,
          text, "Text rendered correctly");
        assert.strictEqual(div.textContent, text, "Text rendered correctly");
      });

      it.skip("Remove an instance", function () {
        flexo.safe_remove(hello);
        assert.strictEqual(div.textContent, "", "Text removed correctly");
      });
    });

    describe("Rendering components from XML", function () {

      var context = bender.create_context(flexo.$div());

      it("A single component with no child instances", function (done) {
        var hello = context.$("instance", { href: "../t/hello.xml" });
        var rendering = false;
        flexo.listen(hello, "@rendering", function () {
          rendering = true;
        });
        flexo.listen(hello, "@rendered", function () {
          assert.isTrue(rendering, "Notified rendering");
          assert.strictEqual(hello._views.$root.nodeType,
            window.Node.ELEMENT_NODE, "Root view is an element")
          done();
        });
        // The @rendering notification will be sent ASAP!
        context.documentElement.appendChild(hello);
      });

      it("A component with children instances", function (done) {
        var nest = context.documentElement.appendChild(
          context.$("instance", { href: "../t/nest.xml" }));
        flexo.listen(nest, "@rendered", function () {
          done();
        });
      });

    });

  });

}(window.chai.assert, window.flexo, window.bender));
