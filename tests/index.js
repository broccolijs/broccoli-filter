/* global describe, it, require */

var Filter    = require('../index');
var broccoli  = require('broccoli');
var expect    = require('expect.js');
var sinon     = require('sinon');
var ms        = require('mocha-subject');
var RSVP      = require('rsvp');
var quickTemp = require('quick-temp')

ms.infect();

DummyFilter.prototype = Object.create(Filter.prototype)
DummyFilter.prototype.constructor = DummyFilter
function DummyFilter (inputTree, options) {
  if (!(this instanceof DummyFilter)) return new DummyFilter(inputTree, options)
  Filter.call(this, inputTree, options)
  this.options = options || {}
}

DummyFilter.prototype.processString = function(string, relativePath) {
  return string;
};

describe('broccoli-filter', function() {
  var sourcePath = 'tests/fixtures',
      builder;

  subject('filter', function() {
    return new DummyFilter(sourcePath);
  });

  afterEach(function() {
    if (builder) {
      builder.cleanup();
    }
  });

  var buildTree = function(inputTree) {
    builder = new broccoli.Builder(inputTree);
    return builder.build();
  };

  describe('write', function() {
    var destDir;
    beforeEach(function() {
      destDir = quickTemp.makeOrReuse(this.filter, 'tmpDestDir');
    });
    afterEach(function() {
      quickTemp.remove(this.filter, 'tmpDestDir');
      this.filter.cleanup();
    });

    it('reads the tree', function() {
      var readIt = sinon.stub().returns(RSVP.resolve(sourcePath));

      this.filter.write(readIt, destDir);

      expect(readIt.calledOnce).to.be.ok();
    });
  });

});
