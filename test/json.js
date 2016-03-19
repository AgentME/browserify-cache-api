var test = require('tap').test;
var execFile = require('child_process').execFile;
var path = require('path');
var through = require('through2');
var fs = require('fs');
var xtend = require('xtend');
var rimraf = require('rimraf');

var basedir = path.resolve(__dirname, '../');
var outputdir = path.join(basedir, 'example', 'output', 'test', 'build');
var mainJs = path.join(outputdir, 'main.js');
var aJson = path.join(outputdir, 'a.json');
var bJson = path.join(outputdir, 'b.json');

test('make sure it handles duplicate json files', function(t) {
  // t.plan(12);

  rimraf(outputdir, {disableGlob:true}, function(err) {
    t.notOk(err, 'dir removed');
    execFile('mkdir', ['-p', outputdir], function(err) {
      t.notOk(err, 'dir created');
      build1();
    });
  });

  function build1() {
    fs.writeFileSync(
      mainJs,
      'console.log(require("./a.json"));\nconsole.log(require("./b.json"));\n'
    );
    fs.writeFileSync(aJson, '{"foo":1}');
    fs.writeFileSync(bJson, '{"foo":1}');

    var b1 = make();

    b1.bundle()
      .pipe(through())
      .on('finish', function() {
        t.ok(true, 'built once');
      })
      .pipe(fs.createWriteStream(path.join(outputdir, 'build1.js')))
      .on('finish', function() {
        var build1 = fs.readFileSync(path.join(outputdir, 'build1.js'), 'utf8');
        var matches = build1.match(/^module\.exports=\{"foo":1\}/gm);
        t.ok(matches && matches.length === 1, 'bundle has correct contents');

        setTimeout(function() {
          build2();
        }, 2000); // mtime resolution can be 1-2s depending on OS
      });
  }

  function build2() {
    // Test a rebuild with nothing changed.

    var b2 = make();

    b2.on('changedDeps', function(invalidated, deleted) {
      t.ok(invalidated.length == 0, 'nothing changed');
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
        var matches = build2.match(/^module\.exports=\{"foo":1\}/gm);
        t.ok(matches && matches.length === 1, 'bundle has correct contents');

        setTimeout(function() {
          build3();
        }, 2000); // mtime resolution can be 1-2s depending on OS
      });
  }

  function build3() {
    fs.writeFileSync(aJson, '{"foo":2}');

    var b3 = make();

    b3.on('changedDeps', function(invalidated, deleted) {
      t.ok(invalidated.length == 1, 'a.json changed');
      t.ok(deleted.length == 0, 'nothing deleted');
    });

    b3.bundle()
      .pipe(through())
      .on('finish', function() {
        t.ok(true, 'built twice');
        t.ok(Object.keys(b3._options.cache).length > 0, 'cache is populated');
      })
      .pipe(fs.createWriteStream(path.join(outputdir, 'build3.js')))
      .on('finish', function() {
        var build3 = fs.readFileSync(path.join(outputdir, 'build3.js'), 'utf8');
        var aMatches = build3.match(/^module\.exports=\{"foo":2\}/gm);
        t.ok(aMatches && aMatches.length === 1, 'bundle has a.json');
        var bMatches = build3.match(/^module\.exports=\{"foo":1\}/gm);
        t.ok(bMatches && bMatches.length === 1, 'bundle has b.json');
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

  b.add(mainJs);

  return b;
}
