var Promise = require('rsvp').Promise;

module.exports = {
  init: function() {},

  processString: function(ctx, contents, relativePath) {
    return Promise.resolve({ string: ctx.processString(contents, relativePath) });
  },

  done: function(ctx) {
    return Promise.resolve(ctx.outputPath);
  }
};
