// Graph visualization for Bender

(function (bender) {
  "use strict";

  function dot(vertices) {
    return "digraph bender {\n  rankdir=LR\n  node [fontname=\"Inconsolata\"];\n%0\n}\n"
      .fmt(vertices.map(function (vertex) {
        return vertex.dot().map(function (line) {
          return "  %0;".fmt(line);
        }).join("\n");
      }).join("\n"));
  }

  // Create a dot description of the watch graph as a string
  bender.Environment.prototype.dot = function () {
    return dot(this.vertices);
  };

  // Create a dot description of the watch graph with pruning
  bender.Environment.prototype.dot_pruned = function () {
    var queue = [this.vortex];
    var vertices = [];
    while (queue.length) {
      var vertex = queue.shift();
      if (!vertex.__seen) {
        vertices.push(vertex);
        vertex.__seen = true;
        vertex.incoming.forEach(function (edge) {
          queue.push(edge.source);
        });
      }
    }
    return dot(vertices.map(function (vertex) {
      delete vertex.__seen;
      return vertex;
    }));
  };

  bender.Vertex.prototype.dot = function () {
    var self = this.dot_name();
    var desc = this.outgoing.map(function (edge) {
      return "%0 -> %1".fmt(self, edge.dest.dot_name());
    });
    var shape = this.dot_shape();
    if (shape) {
      desc.unshift("%0 [shape=%1]".fmt(self, shape));
    }
    var label = this.dot_label();
    if (label) {
      desc.unshift("%0 [label=\"%1\"]".fmt(self, label));
    }
    if (this.uninitialized) {
      desc.unshift("%0 [color=red]".fmt(self)); 
    }
    return desc;
  };

  bender.Vertex.prototype.unmark = function () {
    return this;
  };

  bender.Vertex.prototype.dot_name = function () {
    return "v%0".fmt(this.index);
  };

  bender.Vertex.prototype.dot_label = function () {};

  bender.Vertex.prototype.dot_shape = function () {
    if (this.outgoing.length === 0) {
      return "doublecircle";
    }
  };

  bender.EventVertex.prototype.dot_label = function () {
    return "%0%1%2!%3".fmt(this.target instanceof bender.Component ? "#" : "@",
        this.target._id, this.target.index, this.get.type);
  };

  bender.DOMEventVertex.prototype.dot_label = function () {
    return "%0!%1".fmt(this.target.id || this.target.tagName, this.get.type);
  }

  bender.PropertyVertex.prototype.dot_label = function () {
    return "%0%1%2`%3"
      .fmt(this.component instanceof bender.Component ? "#" : "@",
          this.component._id, this.component.index, this.property.name);
  };

  bender.WatchVertex.prototype.dot_label = function () {
    return "w%0".fmt(this.index);
  };

  bender.WatchVertex.prototype.dot_shape = function () {
    return "square";
  };

}(window.bender));
