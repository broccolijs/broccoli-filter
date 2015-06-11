'use strict';

var inherits = require('util').inherits;
var mockfs = require('mock-fs');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var Builder = require('broccoli').Builder;
var Filter = require('./filter.js');
var minimatch = require('minimatch');

function ReplaceFilter(inputTree, options) {
  if (!this) return new ReplaceFilter(inputTree, options);
  options = options || {};
  Filter.call(this, inputTree, options);
  this._glob = options.glob;
  this._search = options.search;
  this._replacement = options.replace;
}

inherits(ReplaceFilter, Filter);

ReplaceFilter.prototype.canProcessFile = function(relativePath) {
  if (this._glob === void 0) {
    return Filter.prototype.canProcessFile.call(this, relativePath);
  }
  return minimatch(relativePath, this._glob);
};

ReplaceFilter.prototype.processString = function(contents, relativePath) {
  var result = contents.replace(this._search, this._replacement);
  return result;
};

describe('Filter', function() {
  var builder;
  var steps;
  var createdTmpDir = false;

  function mockFS(config) {
    var result = mockfs(config);
    fs.mkdirSync('tmp');
    return result;
  }

  beforeEach(function() {
    builder = void 0;
    createdTmpDir = false;
    steps = [];
    jasmine.addMatchers({
      toFail: function() {
        return {
          negativeCompare: function(err) {
            return {
              pass: !err,
              message: ('stack' in err) ? err.stack : err
            };
          }
        };
      }
    });

  });

  afterEach(function(done) {
    mockfs.restore();
    expect(steps.length).toBe(0);
    if (builder === void 0) return done();
    builder.cleanup().then(done, function(err) {
      expect(err).not.toFail();
      done();
    });
  });

  function step(build, fn) {
    if (arguments.length === 1) {
      fn = build;
      build = false;
    }
    steps.push({
      fn: fn,
      build: build
    });
  }

  function run(done) {
    steps.reduce(function(p, step) {
      if (step.build) {
        // Steps requiring a build
        return p.then(function() {
          return builder.build();
        }).then(step.fn, fail).catch(fail);
      } else {
        // Steps not requiring a build
        return p.then(step.fn).catch(fail);
      }
      function fail(err) {
        expect(err).not.toFail();
        done();
      }
    }, Promise.resolve()).then(done, function(err) {
      expect(err).not.toFail();
      done();
    });
    steps = [];
  }

  function read(relativePath, encoding) {
    encoding = encoding === void 0 ? 'utf8' : encoding;
    return fs.readFileSync(relativePath, encoding);
  }

  function write(relativePath, contents, encoding) {
    encoding = encoding === void 0 ? 'utf8' : encoding;
    mkdirp.sync(path.dirname(relativePath));
    fs.writeFileSync(relativePath, contents, {
      encoding: encoding
    });
  }

  it('should throw if called as a function', function() {
    expect(function() {
      return Filter();
    }).toThrowError(
        TypeError, 'Filter is an abstract class and must be sub-classed');
  });


  it('should throw if called on object which does not a child class of Filter',
      function() {
    expect(function() {
      return Filter.call({});
    }).toThrowError(
        TypeError, 'Filter is an abstract class and must be sub-classed');

    expect(function() {
      return Filter.call([]);
    }).toThrowError(
        TypeError, 'Filter is an abstract class and must be sub-classed');

    expect(function() {
      return Filter.call(global);
    }).toThrowError(
        TypeError, 'Filter is an abstract class and must be sub-classed');
  });


  it('should throw if base Filter class is new-ed', function() {
    expect(function() {
      return new Filter();
    }).toThrowError(
        TypeError, 'Filter is an abstract class and must be sub-classed');
  });


  it('should processString only when canProcessFile returns true',
      function(done) {
    var disk = {
      'dir/a/README.md': mockfs.file({content: 'Nicest dogs in need of homes',
                                      mtime: new Date(1000)}),
      'dir/a/foo.js': mockfs.file({content: 'Nicest dogs in need of homes',
                                   mtime: new Date(1000)})
    };
    mockFS(disk);
    var awk = ReplaceFilter('dir', {
      glob: '**/*.md',
      search: 'dogs',
      replace: 'cats'
    });

    builder = new Builder(awk);

    step(true, function() {
      expect(read(awk.outputPath + '/a/README.md')).
          toBe('Nicest cats in need of homes');
      expect(read(awk.outputPath + '/a/foo.js')).
          toBe('Nicest dogs in need of homes');
    });

    run(done);
  });


  it('should cache status of canProcessFile', function(done) {
    var disk = {
      'dir/a/README.md': mockfs.file({content: 'Nicest dogs in need of homes',
                                      mtime: new Date(1000)}),
      'dir/a/foo.js': mockfs.file({content: 'Nicest dogs in need of homes',
                                   mtime: new Date(1000)})
    };
    mockFS(disk);

    var awk = ReplaceFilter('dir', {
      glob: '**/*.md',
      search: 'dogs',
      replace: 'cats'
    });
    spyOn(awk, 'canProcessFile').and.callThrough();

    builder = new Builder(awk);

    step(true, function() {
      expect(read(awk.outputPath + '/a/README.md')).
          toBe('Nicest cats in need of homes');
      expect(read(awk.outputPath + '/a/foo.js')).
          toBe('Nicest dogs in need of homes');

      expect(awk.canProcessFile.calls.count()).toBe(2);

      write('dir/a/CONTRIBUTING.md', 'All dogs go to heaven!');
    });

    step(true, function() {
      expect(read(awk.outputPath + '/a/README.md')).
          toBe('Nicest cats in need of homes');
      expect(read(awk.outputPath + '/a/foo.js')).
          toBe('Nicest dogs in need of homes');
      expect(read(awk.outputPath + '/a/CONTRIBUTING.md')).
          toBe('All cats go to heaven!');
      expect(awk.canProcessFile.calls.count()).toBe(3);
    });

    step(true, function() {
      expect(awk.canProcessFile.calls.count()).toBe(3);
    });

    run(done);
  });
});
