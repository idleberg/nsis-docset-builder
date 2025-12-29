#!/usr/bin/env node

import { globby } from 'globby';
import { marked } from 'marked';
import { minify } from 'html-minifier-terser';
import { promises as fs } from 'node:fs';
import { render } from 'ejs';
import hljs from 'highlight.js';
import ora from 'ora';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const __dirname = path.resolve(path.dirname(''));
const Dir = getPaths();
const { version } = JSON.parse(await fs.readFile('./package.json', 'utf8'));
let db;

const htmlMinifyOptions = {
    collapseWhitespace: true,
    minifyCSS: true,
    removeAttributeQuotes: true,
    removeComments: true
};

marked.setOptions({
    renderer: new marked.Renderer(),
    baseUrl: path.relative(Dir.documents, path.resolve(Dir.documents, 'html')),
    highlight: code => hljs.highlight(code, {language: 'nsis'}).value
});

await initTable();
await createPages();
await copyStaticFiles();
await createIndex()

async function initTable() {
    try {
        await fs.rm(Dir.docset, { force: true, recursive: true });
        await fs.mkdir(Dir.documents, { recursive: true });
    } catch (e) {
        console.warn(`Could not create build directory`);
    }

    const spinner = ora('Initializing database').start();

    try {
        db = new sqlite3.Database(path.resolve(Dir.resources, 'docSet.dsidx'));

        db.serialize(function() {
            db.run("DROP TABLE IF EXISTS searchIndex;");
            db.run("CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);");
            db.run("CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);");
        });

        spinner.succeed();
    } catch(err) {
        spinner.fail(err.message);
    }
}

async function createPages() {
    const docsPath = path.resolve(__dirname, 'node_modules/@nsis/docs/**/*.md');
    const filePaths = await globby([docsPath, '!**/*README.md']);
    const template = await fs.readFile(path.resolve(__dirname, 'src/templates/docset.ejs'), 'utf8');

    const spinner = ora('Creating pages').start();

    filePaths.forEach(async filePath => {
        const relativeDocsPath = path.dirname(path.relative('node_modules/@nsis/docs/docs', filePath));
        const outPath = `${Dir.documents}/html/${relativeDocsPath}`;

        const { canonicalName, fileName } = getFile(filePath);

        const markdownContent = await fs.readFile(filePath, 'utf8');
        const htmlContent = marked.parse(markdownContent).replaceAll(/\.md/g, '.html');
        const minifiedContent = (await minify(render(template, {
            version: version?.length ? `v${version}` : 'dev',
            ghLink: `https://github.com/NSIS-Dev/Documentation/edit/main/docs/${relativeDocsPath}/${fileName}.md`,
            pageTitle: canonicalName,
            contents: htmlContent,
            relativeAssets: path.relative(outPath, Dir.documents)
        }), htmlMinifyOptions))
        .replaceAll('<pre><code>', '<pre><code class="hljs language-nsis">');

        try {
            await fs.mkdir(outPath, { recursive: true });
        } catch (e) {
            console.warn('Output path exists', outPath);
        }

        const outFile = path.resolve(
            __dirname,
            outPath,
            path.basename(fileName) + '.html'
        );

        await fs.writeFile(outFile, minifiedContent);
        const relativePath = path.relative(path.resolve(Dir.resources, 'Documents'), outFile);

        db.serialize(function() {
            db.run(`INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ('${canonicalName}', '${getType(filePath)}', '${relativePath}');`);
        });
    });

    spinner.succeed();
}

async function createIndex() {
    const spinner = ora('Creating index page...');

    try {
        const template = await fs.readFile(path.resolve(__dirname, 'src/templates/index.ejs'), 'utf8');

        const minifiedContent = await minify(render(template, {
            version: version?.length ? `v${version}` : 'dev',
            xmlFeed: encodeURIComponent('http://nsis-dev.github.io/Docset-Feed/NSIS.xml'),
        }), htmlMinifyOptions);

        const outFile = path.resolve(
            Dir.documents,
            'index.html'
        );

        await fs.writeFile(outFile, minifiedContent);
        spinner.succeed();
    } catch(err) {
        spinner.fail(err.message);
    }
}

async function copyStaticFiles() {
    const spinner = ora('Copying static files');

    try {
        const fontsDir = path.resolve(`${Dir.documents}/fonts`);
        await fs.mkdir(fontsDir, { recursive: true });

        const imgDir = path.resolve(`${Dir.documents}/img`);
        await fs.mkdir(imgDir, { recursive: true });

        const cssDir = path.resolve(`${Dir.documents}/css`);
        await fs.mkdir(cssDir, { recursive: true });

        await fs.copyFile(path.resolve(__dirname, 'src/css/highlight.css'), `${Dir.documents}/css/highlight.css`);
        await fs.copyFile(path.resolve(__dirname, 'src/static/icon.png'), `${Dir.docset}/icon.png`);
        await fs.copyFile(path.resolve(__dirname, 'src/static/icon@2x.png'),  `${Dir.docset}/icon@2x.png`);
        await fs.copyFile(path.resolve(__dirname, 'src/static/Info.plist'),  `${Dir.contents}/Info.plist`);
        await fs.mkdir(fontsDir, { recursive: true });
        await fs.copyFile(path.resolve(__dirname, 'node_modules/@nsis/logo/images/Logo/outlines-light.svg'),  `${imgDir}/logo.svg`);

        const fonts = [
            'FiraMono-Regular.eot',
            'FiraMono-Regular.ttf',
            'FiraMono-Regular.woff2',
            'FiraSans-Light.eot',
            'FiraSans-Light.ttf',
            'FiraSans-Light.woff2',
            'FiraSans-Regular.eot',
            'FiraSans-Regular.ttf',
            'FiraSans-Regular.woff2'
        ];

        Promise.all(fonts.map(async font => {
            const extension = path.extname(font).replace(/^\./, '');
            await fs.copyFile(path.resolve(__dirname, `node_modules/@mozilla/fira/${extension}/${font}`), `${fontsDir}/${font}`);
        }));

        spinner.succeed();
    } catch(err) {
        spinner.fail(err.message);
    }
}

function getType(filePath) {
    switch(true) {
        case filePath.includes('/Callbacks/'):
            return 'Functions';

        case filePath.includes('/Commands/'):
            return 'Commands';

        case filePath.includes('/Includes/'):
            return 'Libraries';

        case filePath.includes('/Plugins/'):
            return 'Plugins';

        case filePath.includes('/Variables/') && path.basename(filePath).startsWith('__'):
            return 'Constants';

        case filePath.includes('/Variables/'):
            return 'Variables';

        default:
            console.warn('Unknown type for', filePath);
    }
}

function getFile(filePath) {
    const baseName = path.basename(filePath, '.md');

    switch(true) {
        case filePath.includes('/Callbacks/') && baseName.startsWith('on'):
            return {
                canonicalName: `.${baseName}`,
                fileName: baseName
            };

        case filePath.includes('/Includes/'):
        case filePath.includes('/Variables/') && path.basename(filePath).startsWith('__'):
            return {
                canonicalName: `$\{${baseName}\}`,
                fileName: baseName
            };

        case filePath.includes('/Variables/'):
            return {
                canonicalName: `$${baseName}`,
                fileName: baseName
            };

        default:
            return {
                canonicalName: baseName,
                fileName: baseName
            };
    }
}

function getPaths() {
    const output = path.resolve(__dirname, '.build');
    const docset = path.resolve(output, 'NSIS.docset');
    const contents = path.resolve(docset, 'Contents');
    const resources = path.resolve(contents, 'Resources');
    const documents = path.resolve(resources, 'Documents');

    return {
        output,
        docset,
        contents,
        resources,
        documents
    };
}
