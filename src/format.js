export function formatHTML(node, options, noEsc = [false], indentLevel = 0, nextNodeShouldStartOnNewLine = false) {
  options = options || Config.DOMProcessing
  var out = ''

  if (typeof node.nodeType === 'undefined') return out

  if (node.nodeType === 1) {
    var ename = node.nodeName.toLowerCase()

    const allChildrenAreInlineOrText = 
      [...node.childNodes].every(child => 
        child.nodeType === Node.TEXT_NODE 
        || (child.nodeType === Node.ELEMENT_NODE 
          && Config.DOMProcessing.inlineElements.includes(child.nodeName.toLowerCase())
        )
      );

    if (node.parentNode?.nodeName.toLowerCase() === "head" ? true : (nextNodeShouldStartOnNewLine && !noEsc.includes(true) && !Config.DOMProcessing.inlineElements.includes(node.nodeName.toLowerCase()))) {
      out += '\n' + '  '.repeat(indentLevel)
    }

    out += '<' + ename

    var attrList = [];

    //Encode attribute values
    for (let i = node.attributes.length - 1; i >= 0; i--) {
      var atn = node.attributes[i];

      let htmlEncodeOptions = { 'mode': 'attribute', 'attributeName': atn.name };

      if (Config.DOMProcessing.urlAttributes.includes(atn.name)) {
        htmlEncodeOptions['mode'] = 'uri';
      }

      attrList.push(atn.name + `="${htmlEncode(atn.value, htmlEncodeOptions)}"`);
    }

    //Sort attributes
    if (attrList.length > 0) {
      if ('sortAttributes' in options && options.sortAttributes) {
        attrList.sort(function (a, b) {
          return a.toLowerCase().localeCompare(b.toLowerCase())
        })
      }
      out += ' ' + attrList.join(' ')
    }

    if (options.voidElements.includes(ename)) {
      out += ' />'
    } else {
      out += '>'

      noEsc.push(ename === 'style' || ename === 'script' || ename === 'pre' || ename === 'code' || ename === 'samp');

      const nextNodeShouldStartOnNewLine = !allChildrenAreInlineOrText && !noEsc.includes(true) // /n < 
      const newlineBeforeClosing = !allChildrenAreInlineOrText && !noEsc.includes(true) && !Config.DOMProcessing.inlineElements.includes(node.nodeName); // /n </

      for (var i = 0; i < node.childNodes.length; i++) {
        out += formatHTML(node.childNodes[i], options, noEsc, indentLevel + 1, nextNodeShouldStartOnNewLine)
      }

      noEsc.pop()

      if (newlineBeforeClosing) {
        out += '\n' + '  '.repeat(indentLevel)
      }

      out += '</' + ename + '>'

      out += (ename == 'html') ? '\n' : ''
    }
  } else if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
    let nl = node.nodeValue

    // XXX: Remove new lines which were added after DOM ready
    // .replace(/\n+$/, '')

    //FIXME: This section needs a lot of testing. If/when domToString is replaced with XML serializer and DOM sanitizer, this section can be removed.

    nl = nl?.replace(/&/g, '&amp;')
    if (noEsc.includes(true)) {
      //Skip style blocks. But do we really want this?
      if (!(node.parentNode && node.parentNode.nodeName.toLowerCase() === 'style') &&
        //Skip data blocks
        !(node.parentNode && node.parentNode.nodeName.toLowerCase() === 'script' && node.parentNode.getAttribute('type') && options.allowedDataBlockTypes.includes(node.parentNode.getAttribute('type').trim()))) {
        nl = nl.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }
    }
    else { //node is not a child text node of style, script, pre, code, or samp, e.g. catches `<p> < > </p>`.
      nl = nl.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
    //Clean double escaped entities, e.g., &amp;amp; -> &amp;, &amp;lt; -> &lt;
    nl = fixDoubleEscapedEntities(nl)
    out += nl
  }
  else {
    console.warn('Warning; Cannot handle serialising nodes of type: ' + node.nodeType)
  }

  return out
}
