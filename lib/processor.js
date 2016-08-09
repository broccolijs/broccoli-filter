function Processor(options) {
  options = options || {};
  this.processor = {};
  this.persistent = options.persist;
}

Processor.prototype.setStrategy = function(stringProcessor) {
  if (this.persistent && /^win/.test(process.platform)) {
    console.log('Unfortunately persistent cache is currently not available on windows based systems. Please see https://github.com/stefanpenner/hash-for-dep/issues/8.');
    return;
  }
  this.processor = stringProcessor;
};

Processor.prototype.init = function(ctx) {
  this.processor.init(ctx);
};

Processor.prototype.processString = function(ctx, contents, relativePath) {
  return this.processor.processString(ctx, contents, relativePath);
};

Processor.prototype.done = function(ctx, result) {
  return this.processor.done(ctx, result);
};

module.exports = Processor;
