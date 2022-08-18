#!/usr/bin/env node

import { globby } from 'globby';
import { marked } from 'marked';
import { minify } from 'html-minifier-terser';
import { promises as fs } from 'node:fs'; 
import { render } from 'ejs';
import hljs from 'highlight.js';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const __dirname = path.resolve(path.dirname(''));
const docsetDir = path.resolve(__dirname, '.build/NSIS.docset');
const contentsDir = path.resolve(__dirname, `${docsetDir}/Contents/`);
const resourcesDir = path.resolve(__dirname, `${contentsDir}/Resources/`);
const documentsDir = path.resolve(resourcesDir, 'Documents');
let db;

console.log({documentsDir})

const htmlMinifyOptions = {
    collapseWhitespace: true,
    removeAttributeQuotes: true,
    removeComments: true
};

marked.setOptions({
    baseUrl: path.relative(documentsDir, path.resolve(documentsDir, 'html')),
    highlight: code => hljs.highlight(code, {language: 'nsis'}).value
});

await initTable();
await createPages();
await copyStaticFiles();

async function initTable() {
    try {
        await fs.rm(resourcesDir, { force: true, recursive: true });
        await fs.mkdir(resourcesDir, { recursive: true });
    } catch (e) {
        console.warn('Could not create build directory');
    }

    db = new sqlite3.Database(path.resolve(resourcesDir, 'docSet.dsidx'));

    db.serialize(function() {
        db.run("DROP TABLE IF EXISTS searchIndex;");
        db.run("CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);");
        db.run("CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);");
    });
}

async function createPages() {
    const docsPath = path.resolve(__dirname, 'node_modules/@nsis/docs/**/*.md');
    const filePaths = await globby([docsPath, '!**/*README.md']);
    const template = await fs.readFile(path.resolve(__dirname, 'src/templates/docset.ejs'), 'utf8');
    const { version } = JSON.parse(await fs.readFile('./package.json', 'utf8'));

    filePaths.forEach(async filePath => {
        const markdownContent = await fs.readFile(filePath, 'utf8');
        const htmlContent = marked.parse(markdownContent).replaceAll(/\.md/g, '.html');
        const minifiedContent = await minify(render(template, {
            version: version,
            ghLink: 'x.x.x',
            pageTitle: 'YOLO',
            contents: htmlContent
        }), htmlMinifyOptions);

        const relativeDocsPath = path.dirname(path.relative('node_modules/@nsis/docs/docs', filePath));
        const outPath = `${docsetDir}/Contents/Resources/Documents/html/${relativeDocsPath}`;
        // console.log(getFile(filePath))

        try {
            await fs.mkdir(outPath, { recursive: true });
        } catch (e) {
            console.warn('Output path exists', outPath);
        }

        const outFile = path.resolve(
            __dirname,
            outPath,
            path.basename(getFile(filePath).fileName) + '.html'
        );

        await fs.writeFile(outFile, minifiedContent);
        // console.log({
        //     filePath,
        //     dirname: path.dirname(filePath),
        //     type: getType(filePath),
        // });
        const relativePath = path.relative(path.resolve(resourcesDir, 'Documents'), outFile);

        // console.log({
        //     filePath,
        //     outFile,
        //     relativePath
        // })

        // getType(filePath);
        // console.log((`INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ('${getFile(filePath).name}', '${getType(filePath)}', '${relativePath}');`));

        db.serialize(function() {
            db.run(`INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ('${getFile(filePath).name}', '${getType(filePath)}', '${relativePath}');`);
        });
    });
}

async function copyStaticFiles() {
    await fs.copyFile(path.resolve(__dirname, 'src/static/icon.png'), `${docsetDir}/icon.png`);
    await fs.copyFile(path.resolve(__dirname, 'src/static/icon@2x.png'),  `${docsetDir}/icon@2x.png`);
    await fs.copyFile(path.resolve(__dirname, 'src/static/Info.plist'),  `${contentsDir}/Info.plist`);

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

    const fontsDir = path.resolve(`${documentsDir}/fonts`);
    await fs.mkdir(fontsDir, { recursive: true });

    Promise.all(fonts.map(async font => {
        const extension = path.extname(font).replace(/^\./, '');
        await fs.copyFile(path.resolve(__dirname, `node_modules/@mozilla/fira/${extension}/${font}`), `${fontsDir}/${font}`);
    }));    
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
                name: `.${baseName}`,
                fileName: baseName
            };

        case filePath.includes('/Includes/'):
        case filePath.includes('/Variables/') && path.basename(filePath).startsWith('__'):
            return {
                name: `$\{${baseName}\}`,
                fileName: baseName
            };

        case filePath.includes('/Variables/'):
            return {
                name: `$${baseName}`,
                fileName: baseName
            };

        default:
            return {
                name: baseName,
                fileName: baseName
            };
    }   
}