# nsis-docset-builder

[![The MIT License](https://img.shields.io/badge/license-MIT-orange.svg?style=flat-square)](http://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/release/idleberg/nsis-docset-builder.svg?style=flat-square)](https://github.com/idleberg/nsis-docset-builder/releases)

Node script to generate [NSIS.docset](https://github.com/idleberg/NSIS.docset)

## Usage

A simple `gulpfile.js` is used to generate the docset. Make sure you got [Node 6](nodejs.org) (or later) and [Gulp](http://gulpjs.com/) installed, then follow these steps:

### Installation

```bash
# Clone repository
$ git clone https://github.com/idleberg/nsis-docset-builder

# Change directory
$ cd nsis-docset-builder

# Install dependencies & build docset
$ yarn || npm install
```

### Upgrade

```bash
# Update dependencies
$ yarn upgrade|| npm update
```

You can manually generate the docset by running `gulp` command. By default, the generated websites use a dark highlighter theme. Use `gulp --theme light` in the last step to use the light theme. 

## License

This work is licensed under the [The MIT License](LICENSE)

## Donate

You are welcome to support this project using [Flattr](https://flattr.com/submit/auto?user_id=idleberg&url=https://github.com/idleberg/nsis-docset-builder) or Bitcoin `17CXJuPsmhuTzFV2k4RKYwpEHVjskJktRd`
