'use strict';

var chai = require('chai');
var expect = chai.expect;
var Cache = require('../cache');

describe('Cache', function() {
  var cache;

  beforeEach(function(){
    cache = new Cache();
  });

  it('has basic cache functionaltiy', function() {
    expect(cache.get('foo')).to.be.undefined;
    expect(cache.set('foo', 1)).to.equal(1);
    expect(cache.get('foo')).to.equal(1);
    expect(cache.get('bar', 2)).to.be.undefined;
    expect(cache.set('bar', 2)).to.equal(2);
    expect(cache.get('foo')).to.equal(1);
    expect(cache.get('bar')).to.equal(2);
    expect(cache.delete('bar')).to.be.undefined;
    expect(cache.get('foo')).to.equal(1);
    expect(cache.get('bar')).to.be.undefined;
  });

  it('without', function() {
    cache.set('foo', 1);
    cache.set('bar', 2);
    cache.set('baz', 2);

    expect(cache.keysWithout(['foo'])).to.eql([
      'bar',
      'baz'
    ]);

    cache.delete('foo');

    expect(cache.keysWithout(['foo'])).to.eql([
      'bar',
      'baz'
    ]);

    cache.delete('bar');

    expect(cache.keysWithout(['foo'])).to.eql([
      'baz'
    ]);
  });

  it('deleteExcept', function() {
    cache.set('foo', 1);
    cache.set('bar', 2);
    cache.set('baz', 2);

    expect(cache.deleteExcept(['foo'])).to.eql([
      'bar',
      'baz'
    ]);

    expect(cache.keys()).to.eql([
      'foo'
    ]);

    cache.set('foo', 1);
    cache.set('bar', 2);
    cache.set('baz', 2);

    expect(cache.deleteExcept(['apple'])).to.eql([
      'foo',
      'bar',
      'baz'
    ]);

    expect(cache.keys()).to.eql([

    ]);

    cache.set('foo', 1);
    cache.set('bar', 2);
    cache.set('baz', 2);

    expect(cache.deleteExcept(['foo', 'bar', 'baz'])).to.eql([]);
    expect(cache.keys()).to.eql([
      'foo',
      'bar',
      'baz'
    ]);
  });
});
