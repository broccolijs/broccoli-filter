'use strict';

var path = require('path');
var Filter = require('../index.js');
var inherits = require('util').inherits;

var fixturePath = path.join(process.cwd(), 'test', 'fixtures');

inherits(HbsToJsFilter, Filter);

function HbsToJsFilter(inputTree, options) {
  if (!this) return new HbsToJsFilter(inputTree, options);
  options = options || {};
  Filter.call(this, inputTree, options);
}

HbsToJsFilter.prototype.processString = function(contents, relativePath) {
  return contents;
}

HbsToJsFilter.prototype.getDestFilePath = function(relativePath) {
  return relativePath.replace(/.hbs$/g, '.js');
}

// HbsToJsFilter.prototype.extensions = ['hbs'];
// HbsToJsFilter.prototype.targetExtension = 'js';

module.exports = {
  HbsToJsFilter: HbsToJsFilter
};
