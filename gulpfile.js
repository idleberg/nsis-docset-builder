'use babel';

const meta = require('./package.json');

// Dependencies
const argv = require('yargs').argv;
const cache = require('gulp-cached');
const concat = require('gulp-concat');
const cssmin   = require('gulp-cssmin');
const debug = require('gulp-debug');
const fs = require('fs');
const gulp = require('gulp');
const Handlebars = require('handlebars');
const htmlmin = require('gulp-htmlmin');
const markdown = require('gulp-markdown');
const mkdirp = require('mkdirp');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const svgmin = require('gulp-svgmin');
const tap = require('gulp-tap');


// Create target folder
mkdirp.sync("build/NSIS.docset/Contents/Resources/");

// Create database file
const db = new sqlite3.Database('build/NSIS.docset/Contents/Resources/docSet.dsidx');

// Specify included Markdown documentation
const docMarkdown = [
  'node_modules/nsis-docs/**/*.md',
  '!node_modules/nsis-docs/README.md',
  '!node_modules/nsis-docs/Plugins/*/**.md'
];


// Build Highlight.js
// via https://github.com/kilianc/rtail/blob/develop/gulpfile.js#L69
gulp.task('build:hljs', (done) => {
  const spawn = require('child_process').spawn;
  let opts = {
    cwd: __dirname + '/node_modules/highlight.js'
  };

  let npmInstall = spawn('npm', ['install'], opts);

  npmInstall.stdout.pipe(process.stdout);
  npmInstall.stderr.pipe(process.stderr);

  npmInstall.on('close', (code) => {
    if (0 !== code) throw new Error('npm install exited with ' + code);

    let build = spawn('node', ['tools/build.js', 'ini', 'nsis'], opts);
    build.stdout.pipe(process.stdout);
    build.stderr.pipe(process.stderr);

    build.on('close', (code) => {
      if (0 !== code) throw new Error('node tools/build.js exited with ' + code);
      done();
    });
  });
});


// Deploy Highlight.js
gulp.task('deploy:hljs', gulp.series('build:hljs', (done) => {
  gulp.src([
    'node_modules/highlight.js/build/highlight.pack.js'
  ])
  .pipe(cache('hljs'))
  .pipe(concat('highlight.min.js'))
  .pipe(debug({title: 'deploy:hljs'}))
  .pipe(gulp.dest('build/NSIS.docset/Contents/Resources/Documents/js/'));

  done();
}));


// Deploy Mozilla Fira
gulp.task('deploy:font', (done) => {
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

    'node_modules/font-awesome/fonts/*'
  ])
  .pipe(gulp.dest('build/NSIS.docset/Contents/Resources/Documents/fonts/'));

  done();
});


// Deploy Mozilla Fira
gulp.task('deploy:icons', (done) => {
  gulp.src([
    'src/img/icon.png',
    'src/img/icon@2x.png'
  ])
  .pipe(gulp.dest('build/NSIS.docset/'));

  done();
});


// Deploy Mozilla Fira
gulp.task('deploy:static', (done) => {
  gulp.src([
    'src/css/start.css'
  ])
  .pipe(cache('css'))
  .pipe(concat('start.min.css'))
  .pipe(debug({title: 'deploy:static'}))
  .pipe(cssmin())
  .pipe(gulp.dest('build/NSIS.docset/Contents/Resources/Documents/css/'));

  done();
});


// Deploy Mozilla Fira
gulp.task('deploy:plist', (done) => {
  gulp.src([
    'src/Info.plist'
  ])
  .pipe(gulp.dest('build/NSIS.docset/Contents/'));

  done();
});


// Minify CSS
gulp.task('build:css', (done) => {
  gulp.src([
    'src/css/fonts.css',
    'node_modules/font-awesome/css/font-awesome.css',
    'src/css/highlighter.css',
    'src/css/theme.css'
  ])
  .pipe(cache('css'))
  .pipe(concat('docset.min.css'))
  .pipe(debug({title: 'build:css'}))
  .pipe(cssmin())
  .pipe(gulp.dest('build/NSIS.docset/Contents/Resources/Documents/css/'));

  done();
});


// Initialize sqlite3 database
gulp.task('db:init', (done) => {
  db.serialize(() => {
    db.run("DROP TABLE IF EXISTS searchIndex;");
    db.run("CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);");
    db.run("CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);");
  });

  done();
});


// Populate sqlite3 database
gulp.task('build:db', gulp.series('db:init', (done) => {
  gulp.src(docMarkdown)
  .pipe(tap( (file) => {

    let data = transformDocs(file.path);

    db.serialize( () => {
      db.run(`INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ('${data.name}', '${data.type}', '${data.dirName}/${data.prettyName}.html');`);
    });
  }));

  done();
}));


// Create index page
gulp.task('build:index', (done) => {
  gulp.src('src/templates/index.hbs')
  .pipe(tap( (file) => {
    template = Handlebars.compile(file.contents.toString());
    html = template(meta);
    file.contents = new Buffer(html, "utf-8");
  }))
  .pipe(htmlmin({collapseWhitespace: true}))
  .pipe(concat('index.html'))
  .pipe(debug({title: 'build:index'}))
  .pipe(gulp.dest('build/NSIS.docset/Contents/Resources/Documents/'));

  done();
});


// Minify SVG
gulp.task('build:svg', (done) => {
  let logo;

  if (typeof argv.logo == 'undefined' || argv.logo === null) {
    logo = 'outlines-dark';
  } else {
    logo = argv.logo;
  }

  gulp.src(`node_modules/nsis-logo-v3/src/Logo/${logo}.svg`)
  .pipe(cache('generate:svg'))
  .pipe(concat('logo.svg'))
  .pipe(debug({title: 'svgmin:'}))
  .pipe(svgmin())
  .pipe(gulp.dest('build/NSIS.docset/Contents/Resources/Documents/img/'));

  done();
});


// Convert Markdown to HTML & compile Handlebars
// via http://learningwithjb.com/posts/markdown-and-handlebars-to-make-pages
gulp.task('build:docset', (done) => {
  gulp.src('src/templates/docset.hbs')
  .pipe(tap( (file) => {
    let count, html, template;

    template = Handlebars.compile(file.contents.toString());

    gulp.src(docMarkdown)
    .pipe(markdown())
    .pipe(tap( (file) => {

      let data = transformDocs(file.path);

        // set the contents to the contents property on data
        data.contents = file.contents.toString();
        // replace .md links
        data.contents = data.contents.replace(/\.md\"/gi, '.html"');

        if (typeof argv.theme == 'undefined' || argv.theme === null) {
          data.highlightStyle = 'dark';
        } else {
          data.highlightStyle = argv.theme;
        }

        parent = path.dirname(file.path.substr(__filename.length + 1)).replace("/nsis-docs/", "");
        data.relativePath = path.join(parent, data.prettyName);
        data.version = meta.version;

        count = (data.relativePath.match(/\//g) || []).length + 1;
        data.assetDepth = "../".repeat(count);

        data.webLink = "https://idleberg.github.io/NSIS.docset/Contents/Resources/Documents/html/" + data.relativePath + ".html";
        data.ghLink = "https://github.com/NSIS-Dev/Documentation/edit/master/" + data.relativePath + ".md";

        // we will pass data to the Handlebars template to create the actual HTML to use
        html = template(data);

        // replace the file contents with the new HTML created from the Handlebars template + data object that contains the HTML made from the markdown conversion
        file.contents = new Buffer(html, "utf-8");
      }))
    .pipe(htmlmin({collapseWhitespace: true}))
    .pipe(debug({title: 'build:docset'}))
    .pipe(gulp.dest('build/NSIS.docset/Contents/Resources/Documents/html/'));
  }));

  done();
});


// Transforms all special cases
function transformDocs(filePath) {
  let data = [];

  data.dirName = path.dirname(filePath.replace(path.join(__dirname, 'node_modules/nsis-docs'), 'html'));
  data.prettyName = path.basename(filePath, path.extname(filePath));

  data.pageTitle = [];
  data.bundle = "Core";

  if (data.dirName.endsWith('Callbacks') && data.prettyName.startsWith("on")) {
    data.name = "." + data.prettyName;
    data.type = "Function";
    data.pageTitle.push(data.bundle);
  } else if (data.dirName.endsWith('Callbacks') && data.prettyName.startsWith("un.on")) {
    data.name = data.prettyName;
    data.type = "Function";
    data.pageTitle.push(data.bundle);
  } else if (data.prettyName.startsWith("__") && data.prettyName.endsWith("__")) {
    data.name = "${" + data.prettyName + "}";
    data.type = "Constant";
    data.pageTitle.push(data.bundle);
  } else if (data.prettyName.startsWith("NSIS") && data.dirName.endsWith('Variables')) {
    data.name = "${" + data.prettyName + "}";
    data.type = "Constant";
    data.pageTitle.push(data.bundle);
  }  else if (data.dirName.endsWith('Variables')) {
    data.name = "$" + data.prettyName;
    data.type = "Variable";
    data.pageTitle.push(data.bundle);
  } else if (data.dirName.startsWith('html/Includes')) {
    data.name = "${" + data.prettyName + "}";
    data.type = "Library";
    data.bundle = path.basename(data.dirName + ".nsh");
    data.pageTitle.push(data.bundle);
  } else {
    data.name = data.prettyName;
    data.type = "Command";
    data.pageTitle.push(data.bundle);
  }

  data.pageTitle.push(data.name);
  data.pageTitle = data.pageTitle.reverse().join(" | ");

  return data;
}


// Available tasks
gulp.task('build:html', gulp.parallel('build:docset', 'build:index', (done) => {
  done();
}));

gulp.task('build', gulp.parallel('build:db', 'build:css', 'build:html', 'build:svg', (done) => {
  done();
}));

gulp.task('deploy', gulp.parallel('deploy:hljs', 'deploy:font', 'deploy:icons', 'deploy:plist', 'deploy:static', (done) => {
  done();
}));

gulp.task('default', gulp.parallel('deploy', 'build', (done) => {
  done();
}));
