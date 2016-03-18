var test = require('tap').test;
var execFile = require('child_process').execFile;
var path = require('path');
var through = require('through2');
var fs = require('fs');
var xtend = require('xtend');
var rimraf = require('rimraf');

var basedir = path.resolve(__dirname, '../');
var outputdir = path.join(basedir, 'example', 'output', 'test', 'build');
var dynamicModule = path.join(outputdir, 'dynamic.js');
var requiresDynamicModule = path.join(outputdir, 'requires-dynamic.js');
var dependentFile = path.join(outputdir, 'dependent.txt');

test('make sure it builds and builds again', function(t) {
  t.plan(12);

  rimraf(outputdir, {disableGlob:true}, function(err) {
    t.notOk(err, 'dir removed');
    execFile('mkdir', ['-p', outputdir], function(err) {
      t.notOk(err, 'dir created');
      fs.writeFileSync(requiresDynamicModule, 'require("./dynamic")');
      build1();
    });
  });

  function build1() {
    fs.writeFileSync(dynamicModule, 'console.log("a")');
    fs.writeFileSync(dependentFile, 'foobar1');

    var b1 = make();

    b1.bundle()
      .pipe(through())
      .on('finish', function() {
        t.ok(true, 'built once');
      })
      .pipe(fs.createWriteStream(path.join(outputdir, 'build1.js')))
      .on('finish', function() {
        setTimeout(function() {
          build2();
        }, 2000); // mtime resolution can be 1-2s depending on OS
      });
  }

  function build2() {
    fs.writeFileSync(dynamicModule, 'console.log("b")');

    var b2 = make();

    b2.on('changedDeps', function(invalidated, deleted) {
      t.ok(invalidated && invalidated.length == 1, 'one file changed');
      t.ok(deleted.length == 0, 'nothing deleted');
    });

    b2.bundle()
      .pipe(through())
      .on('finish', function() {
        t.ok(true, 'built twice');
        t.ok(Object.keys(b2._options.cache).length > 0, 'cache is populated');
      })
      .pipe(fs.createWriteStream(path.join(outputdir, 'build2.js')))
      .on('finish', function() {
        var build2 = fs.readFileSync(path.join(outputdir, 'build2.js'), 'utf8');
        t.ok(build2.indexOf('console.log("b")') >= 0, 'bundle has new contents');

        setTimeout(function() {
          build3();
        }, 2000); // mtime resolution can be 1-2s depending on OS
      });
  }

  function build3() {
    // dependentFile is changed
    fs.writeFileSync(dependentFile, 'foobar2');

    var b3 = make();

    b3.on('changedDeps', function(invalidated, deleted) {
      t.ok(invalidated.length == 0, 'nothing changed');
      t.ok(deleted.length == 0, 'nothing deleted');
    });

    b3.bundle()
      .pipe(through())
      .pipe(fs.createWriteStream(path.join(outputdir, 'build3.js')))
      .on('finish', function() {
        t.ok(true, 'built thrice');

        var build3 = fs.readFileSync(path.join(outputdir, 'build3.js'), 'utf8');
        t.ok(build3.indexOf('foobar2') >= 0, 'bundle has new contents');

        t.end();
      });
  }
});

function make() {
  var browserify = require('browserify');
  var browserifyCache = require('../');

  var opts = xtend({cacheFile: path.join(outputdir, 'cache.json')}, browserifyCache.args);

  var b = browserify(opts);
  browserifyCache(b);

  b.add(requiresDynamicModule);

  // Simulate a transform that includes "dependent.txt" in "dynamic.js"
  b.transform(function(file) {
    if (file != dynamicModule)
      return through();

    return through(function(chunk, enc, cb) {
      var combined = new Buffer(
        chunk.toString() + '\nconsole.log("dependent.txt:", ' +
        JSON.stringify(fs.readFileSync(dependentFile, 'utf8')) +
        ');\n'
      );
      this.push(combined);
      this.emit('file', dependentFile);
      cb();
    });
  });

  return b;
}
