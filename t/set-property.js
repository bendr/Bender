bender.$.x = Object.create(bender.instance);

bender.$.x.init = function () {
  console.log("[init]", this);
  window.x = this;
};

bender.$.x.did_set_property = function (name, value) {
  console.log("[did_set_property] {0} = {1}".fmt(name, this.properties[name]));
};
