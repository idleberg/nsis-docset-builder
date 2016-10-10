'use babel';

const meta = require('./package.json');

// Dependencies
const gulp = require('gulp');
const argv = require('yargs').argv;
const cache = require('gulp-cached');
const concat = require('gulp-concat');
const cssmin   = require('gulp-cssmin');
const debug = require('gulp-debug');
const fs = require('fs');
const Handlebars = require('Handlebars');
const htmlmin = require('gulp-htmlmin');
const markdown = require('gulp-markdown');
const mkdirp = require('mkdirp');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const tap = require('gulp-tap');


// Create target folder
mkdirp.sync("NSIS.docset/Contents/Resources/");

// Create database file
const db = new sqlite3.Database('NSIS.docset/Contents/Resources/docSet.dsidx');


// Tasks
gulp.task('default', ['deploy:hljs', 'deploy:font', 'deploy:icons', 'deploy:plist', 'build:db', 'build:css', 'build:html']);


// Deploy Highlight.js
gulp.task('deploy:hljs', ['build:hljs'],function () {
    return gulp.src([
      'node_modules/highlight.js/build/highlight.pack.js'
      ])
    .pipe(cache('hljs'))
    .pipe(concat('highlight.min.js'))
    .pipe(debug({title: 'cssmin:'}))
    .pipe(gulp.dest('NSIS.docset/Contents/Resources/Documents/js/'));
});


// Deploy Mozilla Fira
gulp.task('deploy:font', function () {
    gulp.src([
        'node_modules/mozilla-fira-pack/Fira/eot/FiraMono-Regular.eot',
        'node_modules/mozilla-fira-pack/Fira/eot/FiraSans-Light.eot',
        'node_modules/mozilla-fira-pack/Fira/eot/FiraSans-Regular.eot',

        'node_modules/mozilla-fira-pack/Fira/woff2/FiraMono-Regular.woff2',
        'node_modules/mozilla-fira-pack/Fira/woff2/FiraSans-Light.woff2',
        'node_modules/mozilla-fira-pack/Fira/woff2/FiraSans-Regular.woff2',

        'node_modules/mozilla-fira-pack/Fira/woff/FiraMono-Regular.woff',
        'node_modules/mozilla-fira-pack/Fira/woff/FiraSans-Light.woff',
        'node_modules/mozilla-fira-pack/Fira/woff/FiraSans-Regular.woff',

        'node_modules/mozilla-fira-pack/Fira/ttf/FiraMono-Regular.ttf',
        'node_modules/mozilla-fira-pack/Fira/ttf/FiraSans-Light.ttf',
        'node_modules/mozilla-fira-pack/Fira/ttf/FiraSans-Regular.ttf',
    ])
    .pipe(gulp.dest('NSIS.docset/Contents/Resources/Documents/font/'));
});


// Deploy Mozilla Fira
gulp.task('deploy:icons', function () {
    gulp.src([
        'src/img/icon.png',
        'src/img/icon@2x.png'
    ])
    .pipe(gulp.dest('NSIS.docset/'));
});


// Deploy Mozilla Fira
gulp.task('deploy:plist', function () {
    gulp.src([
        'src/Info.plist'
    ])
    .pipe(gulp.dest('NSIS.docset/Contents/'));
});


// Minify CSS
gulp.task('build:css', function () {
    gulp.src([
        'src/css/fonts.css',
        'src/css/highlighter.css',
        'src/css/theme.css'
    ])
    .pipe(cache('css'))
    .pipe(concat('docset.min.css'))
    .pipe(debug({title: 'cssmin:'}))
    .pipe(cssmin())
    .pipe(gulp.dest('NSIS.docset/Contents/Resources/Documents/css/'));
});


// Populate sqlite3 database
gulp.task('build:db', ['db:init'], function() {
    return gulp.src([
        '!node_modules/nsis-docs/README.md',
        'node_modules/nsis-docs/**/*.md'
        ])
    .pipe(tap(function(file) {

        let baseName, cmdName, cmdType, dirName, filePath; 

        filePath = file.path;
        dirName = path.dirname(filePath.replace(path.join(__dirname, 'node_modules/nsis-docs'), 'html/'));
        baseName = path.basename(filePath, '.md');

        if (dirName.endsWith('Callbacks') && baseName.startsWith("on")) {
            cmdType = "Function";
            cmdName = "." + baseName;
        } else if (dirName.endsWith('Callbacks') && baseName.startsWith("un.on")) {
            cmdType = "Function";
            cmdName = baseName;
        } else if (baseName.startsWith("__") && baseName.endsWith("__")) {
            cmdType = "Variable";
            cmdName = "${" + baseName + "}";
        }  else if (dirName.endsWith('Variables')) {
            cmdType = "Variable";
            cmdName = "$" + baseName;
        } else if (dirName.startsWith('html/Includes')) {
            cmdType = "Library";
            cmdName = "${" + baseName + "}";
        } else {
            cmdType = "Command";
            cmdName = baseName;
        }
        db.serialize(function() {
            db.run(`INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ('${cmdName}', '${cmdType}', '${dirName}/${baseName}.html');`);
        });
    }));
});


// Convert Markdown to HTML & compile Handlebars
// via http://learningwithjb.com/posts/markdown-and-handlebars-to-make-pages
gulp.task('build:html', function() {
    return gulp.src('src/docset.hbs')
    .pipe(tap(function(file) {
        let count, data, html, template;
        
        template = Handlebars.compile(file.contents.toString());

        return gulp.src([
            '!node_modules/nsis-docs/README.md',
            'node_modules/nsis-docs/**/*.md'
            ])
        .pipe(markdown())
        .pipe(tap(function(file) {

        // set the contents to the contents property on data
        data = {
            contents: file.contents.toString()
        };

        if (typeof argv.theme == 'undefined') {
            data.highlightStyle = 'dark';
        } else {
            data.highlightStyle = argv.theme;
        }

        // replace .md links
        data.contents = data.contents.replace(/\.md\"/gi, '.html"');
        data.name = path.basename(file.path, path.extname(file.path));

        data.parent = path.dirname(file.path.substr(__filename.length + 1)).replace("/nsis-docs/", "");
        data.version = meta.version;

        count = (data.parent.match(/\//g) || []).length + 2;

        data.assetDepth = "../".repeat(count);

        data.github = "https://github.com/NSIS-Dev/Documentation/edit/master/" + data.parent + "/" + data.name + ".md";

        // we will pass data to the Handlebars template to create the actual HTML to use
        html = template(data);

        // replace the file contents with the new HTML created from the Handlebars template + data object that contains the HTML made from the markdown conversion
        file.contents = new Buffer(html, "utf-8");
    }))
    .pipe(htmlmin({collapseWhitespace: true}))
    .pipe(debug({title: 'build:html:'}))
    .pipe(gulp.dest('NSIS.docset/Contents/Resources/Documents/html/'));
    }));
});


// Initialize sqlite3 database
gulp.task('db:init', function() {
    return db.serialize(function() {
        db.run("DROP TABLE IF EXISTS searchIndex;");
        db.run("CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);");
        db.run("CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);");
    });
});


// Build Highlight.js
// via https://github.com/kilianc/rtail/blob/develop/gulpfile.js#L69
gulp.task('build:hljs', function (done) {

    const spawn = require('child_process').spawn;
    let opts = {
        cwd: __dirname + '/node_modules/highlight.js'
    };

    let npmInstall = spawn('npm', ['install'], opts);
    npmInstall.stdout.pipe(process.stdout);
    npmInstall.stderr.pipe(process.stderr);

    npmInstall.on('close', function (code) {
        if (0 !== code) throw new Error('npm install exited with ' + code);

        let build = spawn('node', ['tools/build.js', 'css', 'json', 'nsis', 'xml'], opts);
        build.stdout.pipe(process.stdout);
        build.stderr.pipe(process.stderr);

        build.on('close', function (code) {
          if (0 !== code) throw new Error('node tools/build.js exited with ' + code);
          done();
      });
    });
});
