function Processor() {
  this.processor = {};
}

Processor.prototype.setStrategy = function(stringProcessor) {
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
