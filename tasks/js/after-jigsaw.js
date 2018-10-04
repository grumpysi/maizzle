let fs = require('fs');
let glob = require('glob-all');
let juice = require('juice');
let cheerio = require('cheerio');
let isURL = require('is-url');
let cleanCSS = require('email-remove-unused-css');
let pretty = require('pretty');
let minify = require('html-minifier').minify;
let sixHex = require('color-shorthand-hex-to-six-digit');
let altText = require('html-img-alt');
let stripHtml = require("string-strip-html");

module.exports.processEmails = (config) => {

  let transformers = config.transformers;
  let inlineOpts = transformers.inlineCSS;
  let minifyOpts = transformers.minify;
  let cleanupOpts = transformers.cleanup;
  let files = glob.sync([config.build.destination + '/**/*.html']);
  let extraCss = fs.readFileSync('source/css/extra.css', 'utf8');

  files.map((file) => {

    let html = fs.readFileSync(file, 'utf8');

    if (inlineOpts.enabled) {
      if (inlineOpts.styleToAttribute) {
        juice.styleToAttribute = inlineOpts.styleToAttribute || juice.styleToAttribute;
      }

      if (inlineOpts.applySizeAttribute) {
        juice.widthElements = inlineOpts.applySizeAttribute.width || juice.widthElements;
        juice.heightElements = inlineOpts.applySizeAttribute.height || juice.heightElements;
      }

      if (inlineOpts.codeBlocks) {
        Object.entries(inlineOpts.codeBlocks).forEach(
            ([k, v]) => juice.codeBlocks[k] = v
        );
      }

      html = juice(html, {removeStyleTags: inlineOpts.removeStyleTags || true});
    }

    if (cleanupOpts.removeUnusedCss.enabled) {
      html = cleanCSS(html, {
        whitelist: cleanupOpts.removeUnusedCss.whitelist || [],
        uglify: cleanupOpts.removeUnusedCss.uglify || false,
        removeHTMLComments: cleanupOpts.removeUnusedCss.removeHTMLComments.enabled || true,
        doNotRemoveHTMLCommentsWhoseOpeningTagContains: cleanupOpts.removeUnusedCss.removeHTMLComments.preserve || ['if', 'endif', 'mso', 'ie'],
        }
      ).result;
    }

    let $ = cheerio.load(html, {decodeEntities: false});

    let style = $('style').first();
    style.html(extraCss + style.text());

    if (cleanupOpts.preferAttributeWidth) {
      Object.entries(cleanupOpts.preferAttributeWidth).map(([k, v]) => {
        if (v) {
          $(k).each((i, el) => { $(el).css('width', '') });
        }
      });
    }

    if (cleanupOpts.preferBgColorAttribute) {
      $('[bgcolor]').each((i, elem) => {
        $(elem).css('background-color', '');
      });
    }

    html = $.html();

    let baseImageURL = transformers.baseImageURL;
    if (isURL(baseImageURL)) {
      html = html.replace(/src=("|')([^("|')]*)("|')/gim, 'src="' + baseImageURL + '$2"')
                  .replace(/background=("|')([^("|')]*)("|')/gim, 'background="' + baseImageURL + '$2"')
                  .replace(/background(-image)?:\s?url\(("|')?([^("|')]*)("|')?\)/gim, "url('" + baseImageURL + "$3')");
    }

    if (transformers.prettify) {
      html = pretty(html, {ocd: true, indent_inner_html: false});
    }

    html = minify(html, {
      html5: false,
      keepClosingSlash: true,
      removeEmptyAttributes: true,
      includeAutoGeneratedTags: false,
      minifyCSS: minifyOpts.minifyCSS,
      maxLineLength: minifyOpts.maxLineLength,
      collapseWhitespace: minifyOpts.collapseWhitespace,
      preserveLineBreaks: minifyOpts.preserveLineBreaks,
      conservativeCollapse: minifyOpts.conservativeCollapse,
      processConditionalComments: minifyOpts.processConditionalComments
    });

    if (transformers.sixHex) {
      html = sixHex(html);
    }

    if (transformers.altText) {
      html = altText(html);
    }

    fs.writeFileSync(file, html);

    if (config.plaintext) {
      let plaintext = stripHtml(html, {
                        dumpLinkHrefsNearby: {
                          enabled: true,
                          putOnNewLine: true,
                          wrapHeads: '[',
                          wrapTails: ']',
                        }
                      });

      let plaintextPath = file.replace(/(\.blade\.php|\.html)/, '.txt');

      fs.writeFileSync(plaintextPath, plaintext);
    }
  });
}
