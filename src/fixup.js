/******************************************************************************
 *                 JS Extension for the W3C Spec Style Sheet                  *
 *                                                                            *
 * This code handles:                                                         *
 * - some fixup to improve the table of contents                              *
 * - the obsolete warning on outdated specs                                   *
 ******************************************************************************/
(function() {
  "use strict";
  try {
    var details = document.querySelector("div.head details");
    details.addEventListener("toggle", function toggle() {
      window.localStorage.setItem("tr-metadata", details.open);
    }, false);
    details.open = !localStorage.getItem("tr-metadata") || localStorage.getItem("tr-metadata") === 'true';
  } catch (e) {}; // ignore errors for this interaction

  const tocToggleId = 'toc-toggle';
  const tocJumpId = 'toc-jump';
  const tocCollapseId = 'toc-collapse';
  const tocExpandId = 'toc-expand';
  const tocThemeToggle = 'toc-theme-toggle';

  var ESCAPEKEY = 27;

  // Internationalization support for sidebar/jump text
  var lang = document.documentElement.lang || 'en';
  var i18n = {
    en: {
      collapseSidebar: 'Collapse Sidebar',
      expandSidebar: 'Pop Out Sidebar',
      jumpToToc: 'Jump to Table of Contents',
    },
    cs: {
      collapseSidebar: 'Skrýt postranní panel',
      expandSidebar: 'Zobrazit postranní panel',
      jumpToToc: 'Přejít na obsah',
    },
    de: {
      collapseSidebar: 'Seitenleiste einklappen',
      expandSidebar: 'Seitenleiste ausklappen',
      jumpToToc: 'Zum Inhaltsverzeichnis springen',
    },
    es: {
      collapseSidebar: 'Colapsar barra lateral',
      expandSidebar: 'Mostrar barra lateral',
      jumpToToc: 'Ir al índice',
    },
    ja: {
      collapseSidebar: 'サイドバーを折りたたむ',
      expandSidebar: 'サイドバーを表示',
      jumpToToc: '目次へジャンプ',
    },
    ko: {
      collapseSidebar: '사이드바 접기',
      expandSidebar: '사이드바 펼치기',
      jumpToToc: '목차로 이동',
    },
    nl: {
      collapseSidebar: 'Zijbalk samenvouwen',
      expandSidebar: 'Zijbalk uitklappen',
      jumpToToc: 'Naar inhoudsopgave',
    },
    zh: {
      collapseSidebar: '收起侧边栏',
      expandSidebar: '展开侧边栏',
      jumpToToc: '跳转到目录',
    }
  };
  var t = i18n[lang] || i18n['en'];
  var collapseSidebarText = '<span aria-hidden="true">←</span> '
                          + `<span id="${tocCollapseId}-text">${t.collapseSidebar}</span>`;
  var expandSidebarText   = '<span aria-hidden="true">→</span> '
                          + `<span id="${tocExpandId}-text">${t.expandSidebar}</span>`;
  var tocJumpText         = '<span aria-hidden="true">↑</span> '
                          + `<span id="${tocJumpId}-text">${t.jumpToToc}</span>`;

  var sidebarMedia = window.matchMedia('screen and (min-width: 78em)');
  var autoToggle   = function(e){ toggleSidebar(e.matches) };
  if(sidebarMedia.addListener) {
    sidebarMedia.addListener(autoToggle);
  }

  function toggleSidebar(on, skipScroll) {
    if (on == undefined) {
      on = !document.body.classList.contains('toc-sidebar');
    }

    if (!skipScroll) {
      /* Don't scroll to compensate for the ToC if we're above it already. */
      var headY = 0;
      var head = document.querySelector('.head');
      if (head) {
        // terrible approx of "top of ToC"
        headY += head.offsetTop + head.offsetHeight;
      }
      skipScroll = window.scrollY < headY;
    }

    var toggle = document.getElementById(tocToggleId);
    var tocNav = document.getElementById('toc');
    if (on) {
      var tocHeight = tocNav.offsetHeight;
      document.body.classList.add('toc-sidebar');
      document.body.classList.remove('toc-inline');
      toggle.innerHTML = collapseSidebarText;
      toggle.setAttribute('aria-labelledby', `${tocCollapseId}-text`);
      if (!skipScroll) {
        window.scrollBy(0, 0 - tocHeight);
      }
      tocNav.focus();
      sidebarMedia.addListener(autoToggle); // auto-collapse when out of room
    }
    else {
      document.body.classList.add('toc-inline');
      document.body.classList.remove('toc-sidebar');
      toggle.innerHTML = expandSidebarText;
      toggle.setAttribute('aria-labelledby', `${tocExpandId}-text`);
      if (!skipScroll) {
        window.scrollBy(0, tocNav.offsetHeight);
      }
      if (toggle.matches(':hover')) {
        /* Unfocus button when not using keyboard navigation,
           because I don't know where else to send the focus. */
        toggle.blur();
      }
    }
  }

  function createSidebarToggle() {
    /* Create the sidebar toggle in JS; it shouldn't exist when JS is off. */
    var toggle = document.createElement('a');
      /* This should probably be a button, but appearance isn't standards-track.*/
    toggle.id = tocToggleId;
    toggle.class = 'toc-toggle';
    toggle.href = '#toc';
    toggle.innerHTML = collapseSidebarText;
    toggle.setAttribute('aria-labelledby', `${tocCollapseId}-text`);

    sidebarMedia.addListener(autoToggle);
    var toggler = function(e) {
      e.preventDefault();
      sidebarMedia.removeListener(autoToggle); // persist explicit off states
      toggleSidebar();
      return false;
    }
    toggle.addEventListener('click', toggler, false);


    /* Get <nav id=toc-nav>, or make it if we don't have one. */
    var tocNav = document.getElementById('toc-nav');
    if (!tocNav) {
      tocNav = document.createElement('p');
      tocNav.id = 'toc-nav';
      /* Prepend for better keyboard navigation */
      document.body.insertBefore(tocNav, document.body.firstChild);
    }
    /* While we're at it, make sure we have a Jump to Toc link. */
    var tocJump = document.getElementById(tocJumpId);
    if (!tocJump) {
      tocJump = document.createElement('a');
      tocJump.id = tocJumpId;
      tocJump.href = '#toc';
      tocJump.innerHTML = tocJumpText;
      tocJump.setAttribute('aria-labelledby', `${tocJumpId}-text`);
      tocNav.appendChild(tocJump);
    }

    tocNav.appendChild(toggle);
  }

  var toc = document.getElementById('toc');
  if (toc) {
    if (!document.getElementById(tocToggleId)) {
      createSidebarToggle();
    }
    toggleSidebar(sidebarMedia.matches, true);

    /* If the sidebar has been manually opened and is currently overlaying the text
       (window too small for the MQ to add the margin to body),
       then auto-close the sidebar once you click on something in there. */
    toc.addEventListener('click', function(e) {
      if(document.body.classList.contains('toc-sidebar') && !sidebarMedia.matches) {
        var el = e.target;
        while (el != toc) { // find closest <a>
          if (el.tagName.toLowerCase() == "a") {
            toggleSidebar(false);
            return;
          }
          el = el.parentElement;
        }
      }
    }, false);
  }
  else {
    console.warn("Can't find Table of Contents. Please use <nav id='toc'> around the ToC.");
  }

  /* Amendment Diff Toggling */
  var showDiff = function(event) {
    var a = event.target.parentElement.parentElement;
    var ins = document.querySelectorAll("ins[cite='#" + a.id + "'], #" + a.id + " ins" );
    var del = document.querySelectorAll("del[cite='#" + a.id + "'], #" + a.id + " del" );
    ins.forEach( function(e) { e.hidden = false; e.classList.remove("diff-inactive") });
    del.forEach( function(e) { e.hidden = false; e.classList.remove("diff-inactive") });
    a.querySelectorAll("button[value=diff]")[0].disabled = true;
    a.querySelectorAll("button[value=old]")[0].disabled = false;
    a.querySelectorAll("button[value=new]")[0].disabled = false;
  }
  var showOld = function(event) {
    var a = event.target.parentElement.parentElement;
    var ins = document.querySelectorAll("ins[cite='#" + a.id + "'], #" + a.id + " ins" );
    var del = document.querySelectorAll("del[cite='#" + a.id + "'], #" + a.id + " del" );
    ins.forEach( function(e) { e.hidden = true;  e.classList.add("diff-inactive") });
    del.forEach( function(e) { e.hidden = false; e.classList.add("diff-inactive") });
    a.querySelectorAll("button[value=diff]")[0].disabled = false;
    a.querySelectorAll("button[value=old]")[0].disabled = true;
    a.querySelectorAll("button[value=new]")[0].disabled = false;
  }
  var showNew = function(event) {
    var a = event.target.parentElement.parentElement;
    var ins = document.querySelectorAll("ins[cite='#" + a.id + "'], #" + a.id + " ins" );
    var del = document.querySelectorAll("del[cite='#" + a.id + "'], #" + a.id + " del" );
    ins.forEach( function(e) { e.hidden = false;  e.classList.add("diff-inactive") });
    del.forEach( function(e) { e.hidden = true; e.classList.add("diff-inactive") });
    a.querySelectorAll("button[value=diff]")[0].disabled = false;
    a.querySelectorAll("button[value=old]")[0].disabled = false;
    a.querySelectorAll("button[value=new]")[0].disabled = true;
  }
  var amendments = document.querySelectorAll('[id].amendment, [id].correction, [id].addition');
  amendments.forEach( function(a) {
    var ins = document.querySelectorAll("ins[cite='#" + a.id + "'], #" + a.id + " ins" );
    var del = document.querySelectorAll("del[cite='#" + a.id + "'], #" + a.id + " del" );
    if (ins.length == 0 && del.length == 0) { return; }

    var tbar = document.createElement('div');
    tbar.lang = 'en';
    tbar.className = 'amendment-toggles';

    if (document.respec) tbar.classList.add('removeOnSave');

    var toggle = document.createElement('button');
    toggle.value = 'diff'; toggle.innerHTML = 'Show Change'; toggle.disabled = true;
    toggle.addEventListener('click', showDiff, false);
    tbar.appendChild(toggle);

    toggle = document.createElement('button');
    toggle.value = 'old'; toggle.innerHTML = 'Show Current';
    toggle.addEventListener('click', showOld, false);
    tbar.appendChild(toggle);

    toggle = document.createElement('button');
    toggle.value = 'new'; toggle.innerHTML = 'Show Future';
    toggle.addEventListener('click', showNew, false);
    tbar.appendChild(toggle);

    a.appendChild(tbar);
  });

  /* Wrap tables in case they overflow */
  var tables = document.querySelectorAll(':not(.overlarge) > table.data, :not(.overlarge) > table.index');
  var numTables = tables.length;
  for (var i = 0; i < numTables; i++) {
    var table = tables[i];
    if (!table.matches('.example *, .note *, .advisement *, .def *, .issue *')) {
      /* Overflowing colored boxes looks terrible, and also
         the kinds of tables inside these boxes
         are less likely to need extra space. */
      var wrapper = document.createElement('div');
      wrapper.className = 'overlarge';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  }

  /* Deprecation warning */
  if (document.location.hostname === "www.w3.org" && /^\/TR\/\d{4}\//.test(document.location.pathname)) {
    var request = new XMLHttpRequest();

    request.open('GET', 'https://www.w3.org/TR/tr-outdated-spec');
    request.onload = function() {
      if (request.status < 200 || request.status >= 400) {
        return;
      }
      try {
        var currentSpec = JSON.parse(request.responseText);
      } catch (err) {
        console.error(err);
        return;
      }
      document.body.classList.add("outdated-spec");
      var node = document.createElement("p");
      node.classList.add("outdated-warning");
      if (currentSpec.style) {
          node.classList.add(currentSpec.style);
      }

      var frag = document.createDocumentFragment();
      var heading = document.createElement("strong");
      heading.id = "outdatedWarning";
      heading.innerHTML = currentSpec.header;
      frag.appendChild(heading);

      var anchor = document.createElement("a");
      anchor.href = currentSpec.latestUrl;
      anchor.innerText = currentSpec.latestUrl + ".";

      var warning = document.createElement("span");
      warning.innerText = currentSpec.warning;
      warning.appendChild(anchor);
      frag.appendChild(warning);

      var button = document.createElement("button");
      var handler = makeClickHandler(node);
      button.addEventListener("click", handler);
      button.innerHTML = "&#9662; collapse";
      frag.appendChild(button);
      node.appendChild(frag);

      function makeClickHandler(node) {
        var isOpen = true;
        return function collapseWarning(event) {
          var button = event.target;
          isOpen = !isOpen;
          node.classList.toggle("outdated-collapsed");
          document.body.classList.toggle("outdated-spec");
          button.innerText = (isOpen) ? '\u25BE collapse' : '\u25B4 expand';
          button.setAttribute("aria-label", (isOpen) ? "Collapse warning" : "Expand warning");
        }
      }

      // add to top of DOM for easier discoverability
      document.body.prepend(node);
      button.focus();
      window.onkeydown = function (event) {
        var isCollapsed = node.classList.contains("outdated-collapsed");
        if (event.keyCode === ESCAPEKEY && !isCollapsed) {
          button.click();
        }
      }

      window.addEventListener("click", function(event) {
        if (!node.contains(event.target) && !node.classList.contains("outdated-collapsed")) {
          button.click();
        }
      });

      document.addEventListener("focus", function(event) {
        var isCollapsed = node.classList.contains("outdated-collapsed");
        var containsTarget = node.contains(event.target);
        if (!isCollapsed && !containsTarget) {
          event.stopPropagation();
          // add to bottom of DOM as the user is already aware of the warning
          node.parentNode.removeChild(node);
          document.body.appendChild(node);
      
        }
      }, true); // use capture to enable event delegation as focus doesn't bubble up
    };

    request.onerror = function() {
      console.error("Request to https://www.w3.org/TR/tr-outdated-spec failed.");
    };

    request.send();
  }

  /* Dark mode toggle */
  const darkCss = document.querySelector('link[rel~="stylesheet"][href^="https://www.w3.org/StyleSheets/TR/2021/dark"]');
  if (darkCss) {
    let colorScheme = localStorage.getItem("tr-theme") || "auto";
    darkCss.media = "";
    function updateTheme() {
      colorScheme = localStorage.getItem("tr-theme") || "auto";
      const browserDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = colorScheme === "auto" ? (browserDarkMode ? "dark" : "light") : colorScheme;

      darkCss.disabled = theme === "light";
      document.body.classList.toggle("darkmode", theme === "dark")
    }

    updateTheme();
    const render = document.createElement("div");
    function createOption(option) {
      const checked = option === colorScheme;
      return `
        <label>
          <input name="color-scheme" type="radio" value="${option}" ${checked ? "checked": ""}>
          <span>${option}</span>
        </label>
      `.trim();
    }
    if (!document.getElementById(tocThemeToggle)) {
      render.innerHTML = `
        <a id="toc-theme-toggle" role="radiogroup" aria-label="Select a color scheme">
          <span aria-hidden="true"><img src="https://www.w3.org/StyleSheets/TR/2021/logos/dark.svg" title="theme toggle icon" /></span>
          <span>
          ${["light", "dark", "auto"].map(createOption).join("")}
          </span>
        </a>
      `;
    }
    const changeListener = (event) => {
      const { value } = event.target;
      const browserDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = value === "auto" ? (browserDarkMode ? "dark" : "light") : value;

      darkCss.disabled = theme === "light";
      document.body.classList.toggle("darkmode", theme === "dark")
      localStorage.setItem("tr-theme", value);
    };
    render.querySelectorAll("input[type='radio']").forEach((input) => {
      input.addEventListener("change", changeListener);
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      updateTheme();
    });

    var tocNav = document.querySelector('#toc-nav');
    tocNav.appendChild(...render.children);
  }

})();
