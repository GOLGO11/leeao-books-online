const state = {
  catalog: null,
  categoryMap: new Map(),
  bookMap: new Map(),
  chaptersByBook: new Map(),
  loadedBooks: new Map(),
  currentBook: null,
  fontSize: Number(localStorage.getItem("leeaoFontSize")) || 19,
  theme: localStorage.getItem("leeaoTheme") || "light",
  locale: localStorage.getItem("leeaoLocale") || "simp",
  converters: new Map(),
};

const $ = (id) => document.getElementById(id);
const qs = (selector) => document.querySelector(selector);
const numberFormatter = new Intl.NumberFormat("zh-CN");

document.documentElement.dataset.theme = state.theme;
document.documentElement.style.setProperty("--reader-font-size", `${state.fontSize}px`);

init().catch((error) => {
  console.error(error);
  $("content").innerHTML = `<p class="empty">数据载入失败：${escapeHtml(error.message)}</p>`;
});

async function init() {
  state.catalog = await fetchJson("./data/catalog.json");
  buildIndexes();
  attachEvents();
  applyStaticLocale();
  renderSidebar();
  await handleRoute();
  window.addEventListener("hashchange", () => handleRoute());
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function buildIndexes() {
  for (const category of state.catalog.categories) {
    state.categoryMap.set(category.id, category);
  }
  for (const book of state.catalog.books) {
    state.bookMap.set(book.id, book);
  }
  for (const chapter of state.catalog.chaptersIndex) {
    const chapters = state.chaptersByBook.get(chapter.bookId) || [];
    chapters.push(chapter);
    state.chaptersByBook.set(chapter.bookId, chapters);
  }
}

function attachEvents() {
  $("menuToggle").addEventListener("click", () => document.body.classList.add("sidebar-open"));
  $("closeSidebar").addEventListener("click", () => document.body.classList.remove("sidebar-open"));
  $("globalSearch").addEventListener("input", (event) => renderSearch(event.target.value));
  $("fontDown").addEventListener("click", () => setFontSize(state.fontSize - 1));
  $("fontUp").addEventListener("click", () => setFontSize(state.fontSize + 1));
  $("localeToggle").addEventListener("click", toggleLocale);
  $("themeToggle").addEventListener("click", toggleTheme);
}

function setFontSize(size) {
  state.fontSize = Math.min(25, Math.max(15, size));
  localStorage.setItem("leeaoFontSize", String(state.fontSize));
  document.documentElement.style.setProperty("--reader-font-size", `${state.fontSize}px`);
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("leeaoTheme", state.theme);
  document.documentElement.dataset.theme = state.theme;
}

async function toggleLocale() {
  state.locale = state.locale === "trad" ? "simp" : "trad";
  localStorage.setItem("leeaoLocale", state.locale);
  applyStaticLocale();
  renderSidebar();
  await handleRoute();
  renderSearch($("globalSearch").value);
}

function applyStaticLocale() {
  document.documentElement.lang = state.locale === "trad" ? "zh-Hant" : "zh-CN";
  qs(".brand").textContent = tr("大李敖全集 6.0");
  $("globalSearch").placeholder = tr("搜索书名、篇名、当前书正文");
  $("menuToggle").ariaLabel = tr("打开目录");
  $("closeSidebar").ariaLabel = tr("关闭目录");
  $("fontDown").title = tr("缩小字号");
  $("fontDown").ariaLabel = tr("缩小字号");
  $("fontUp").title = tr("放大字号");
  $("fontUp").ariaLabel = tr("放大字号");
  $("localeToggle").textContent = state.locale === "trad" ? "简" : "繁";
  $("localeToggle").title = state.locale === "trad" ? "切换简体" : "切换繁体";
  $("localeToggle").ariaLabel = $("localeToggle").title;
  $("themeToggle").title = tr("切换明暗主题");
  $("themeToggle").ariaLabel = tr("切换明暗主题");
  qs(".sidebar-head strong").textContent = tr("大李敖全集 6.0");
  qs(".home-link").textContent = tr("项目简介");
  $("outline").ariaLabel = tr("书目");
  qs(".toolbar").ariaLabel = tr("阅读设置");
}

function tr(text) {
  const source = String(text);
  if (state.locale !== "trad") return source;
  return toTraditional(source);
}

function toTraditional(text) {
  const converter = getConverter("cn", "tw");
  return converter ? converter(String(text)) : String(text);
}

function toSimplifiedForSearch(text) {
  const converter = getConverter("tw", "cn");
  return converter ? converter(String(text)) : String(text);
}

function getConverter(from, to) {
  const key = `${from}-${to}`;
  if (state.converters.has(key)) return state.converters.get(key);
  if (!window.OpenCC?.Converter) {
    state.converters.set(key, null);
    return null;
  }
  const converter = window.OpenCC.Converter({ from, to });
  state.converters.set(key, converter);
  return converter;
}

function convertElement(root) {
  if (state.locale !== "trad" || !root) return;
  const converter = getConverter("cn", "tw");
  if (!converter) return;
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (parent?.closest("script, style, textarea, input")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    node.nodeValue = converter(node.nodeValue);
  }
}

function renderSidebar() {
  $("sidebarStats").textContent = tr(`${numberFormatter.format(state.catalog.totals.books)} 本 · ${numberFormatter.format(state.catalog.totals.chapters)} 篇`);

  $("outline").innerHTML = state.catalog.categories
    .map((category) => {
      const books = state.catalog.books.filter((book) => book.categoryId === category.id);
      if (!books.length) return "";

      return `
        <section class="category">
          <h2>${escapeHtml(category.title)} <small>${books.length}</small></h2>
          <ul>
            ${books
              .map((book) => {
                const active = state.currentBook?.id === book.id ? " class=\"active\"" : "";
                return `<li><a${active} href="#book/${book.id}">${escapeHtml(book.title)}</a></li>`;
              })
              .join("")}
          </ul>
        </section>
      `;
    })
    .join("");
  convertElement($("outline"));
}

async function handleRoute() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, "")) || "home";
  const [route, bookId, chapterId] = hash.split("/");

  if (route === "book" && bookId) {
    await openBook(bookId, chapterId);
    return;
  }

  renderHome();
}

function renderHome() {
  state.currentBook = null;
  renderSidebar();
  const totals = state.catalog.totals;
  const progress = readProgress();
  const progressBook = progress ? state.bookMap.get(progress.bookId) : null;
  const progressChapter = progress && progressBook ? findChapterMeta(progress.bookId, progress.chapterId) : null;

  $("content").innerHTML = `
    <h1>大李敖全集6.0</h1>
    <p class="meta">${numberFormatter.format(totals.books)} 本 · ${numberFormatter.format(totals.chapters)} 篇 · ${shortNumber(totals.chars)} 字符</p>
    <p>此处将本地分章节文本整理为在线阅读版。左侧目录按分类和书名展开，进入一本书后可从本书目录跳转到任一篇章。</p>
    ${
      progressBook && progressChapter
        ? `<p class="continue"><a href="#book/${progressBook.id}/${progressChapter.id}">继续阅读：${escapeHtml(progressBook.title)} / ${escapeHtml(progressChapter.title)}</a></p>`
        : ""
    }
    <h2>${escapeHtml(state.catalog.intro.title)}</h2>
    ${textToHtml(state.catalog.intro.text)}
  `;
  convertElement($("content"));

  $("main").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function openBook(bookId, chapterId) {
  const meta = state.bookMap.get(bookId);
  if (!meta) {
    $("content").innerHTML = `<p class="empty">找不到这本书：${escapeHtml(bookId)}</p>`;
    return;
  }

  const book = await loadBook(bookId);
  state.currentBook = book;
  renderSidebar();
  renderBook(book);
  renderSearch($("globalSearch").value);

  if (chapterId) {
    scrollToChapter(chapterId);
    saveProgress(book.id, chapterId);
  } else {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  document.body.classList.remove("sidebar-open");
}

async function loadBook(bookId) {
  if (!state.loadedBooks.has(bookId)) {
    state.loadedBooks.set(bookId, await fetchJson(`./data/books/${bookId}.json`));
  }
  return state.loadedBooks.get(bookId);
}

function renderBook(book) {
  $("content").innerHTML = `
    <nav class="breadcrumb">
      <a href="#home">项目简介</a>
      <span>/</span>
      <span>${escapeHtml(book.categoryTitle)}</span>
    </nav>
    <h1>${escapeHtml(book.title)}</h1>
    <p class="meta">${escapeHtml(book.categoryTitle)} · ${numberFormatter.format(book.chapters.length)} 篇 · ${shortNumber(book.charCount)} 字符</p>
    <h2>目录</h2>
    <ol class="chapter-toc">
      ${book.chapters
        .map((chapter) => `<li><a href="#book/${book.id}/${chapter.id}">${escapeHtml(chapter.title)}</a></li>`)
        .join("")}
    </ol>
    ${book.chapters.map(renderChapter).join("")}
  `;
  convertElement($("content"));
}

function renderChapter(chapter) {
  return `
    <section class="chapter" id="${chapter.id}">
      <h2>${escapeHtml(chapter.title)}</h2>
      ${textToHtml(stripRepeatedTitle(chapter.text, chapter.title))}
    </section>
  `;
}

function scrollToChapter(chapterId) {
  requestAnimationFrame(() => {
    const target = document.getElementById(chapterId);
    if (target) target.scrollIntoView({ block: "start", behavior: "auto" });
  });
}

function renderSearch(rawQuery) {
  const query = rawQuery.trim();
  const container = $("searchResults");
  if (!query) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const searchNeedle = toSimplifiedForSearch(query);
  const lower = searchNeedle.toLowerCase();
  const bookMatches = state.catalog.books
    .filter((book) => `${book.title} ${book.categoryTitle}`.toLowerCase().includes(lower))
    .slice(0, 12);
  const chapterMatches = state.catalog.chaptersIndex
    .filter((chapter) => `${chapter.title} ${chapter.bookTitle} ${chapter.categoryTitle}`.toLowerCase().includes(lower))
    .slice(0, 16);
  const bodyMatches =
    state.currentBook && query.length >= 2
      ? state.currentBook.chapters
          .map((chapter) => {
            const index = chapter.text.toLowerCase().indexOf(lower);
            return index >= 0 ? { chapter, index } : null;
          })
          .filter(Boolean)
          .slice(0, 10)
      : [];

  container.hidden = false;
  container.innerHTML = `
    <div class="search-head">
      <strong>搜索 “${escapeHtml(query)}”</strong>
      <button type="button" id="closeSearch">关闭</button>
    </div>
    ${renderResultGroup(
      "书名",
      bookMatches.map((book) => ({
        href: `#book/${book.id}`,
        title: highlight(book.title, searchNeedle),
        meta: `${escapeHtml(book.categoryTitle)} · ${numberFormatter.format(book.chapterCount)} 篇`,
      })),
    )}
    ${renderResultGroup(
      "篇名",
      chapterMatches.map((chapter) => ({
        href: `#book/${chapter.bookId}/${chapter.id}`,
        title: highlight(chapter.title, searchNeedle),
        meta: `${escapeHtml(chapter.bookTitle)} · ${escapeHtml(chapter.categoryTitle)}`,
      })),
    )}
    ${renderResultGroup(
      state.currentBook ? `当前书正文：${state.currentBook.title}` : "当前书正文",
      bodyMatches.map(({ chapter, index }) => ({
        href: `#book/${state.currentBook.id}/${chapter.id}`,
        title: highlight(chapter.title, searchNeedle),
        meta: highlight(makeSnippet(chapter.text, index, searchNeedle.length), searchNeedle),
      })),
      state.currentBook ? "正文搜索至少输入两个字。" : "打开一本书后可搜索正文。",
    )}
  `;

  $("closeSearch").addEventListener("click", () => {
    $("globalSearch").value = "";
    renderSearch("");
  });
  convertElement(container);
}

function renderResultGroup(title, items, emptyText = "没有匹配项。") {
  return `
    <section class="result-group">
      <h3>${escapeHtml(title)}</h3>
      ${
        items.length
          ? items
              .map(
                (item) => `
                  <a class="result" href="${item.href}">
                    <strong>${item.title}</strong>
                    <small>${item.meta}</small>
                  </a>
                `,
              )
              .join("")
          : `<p>${escapeHtml(emptyText)}</p>`
      }
    </section>
  `;
}

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem("leeaoProgress") || "null");
  } catch {
    return null;
  }
}

function saveProgress(bookId, chapterId) {
  localStorage.setItem("leeaoProgress", JSON.stringify({ bookId, chapterId, savedAt: Date.now() }));
}

function findChapterMeta(bookId, chapterId) {
  return (state.chaptersByBook.get(bookId) || []).find((chapter) => chapter.id === chapterId);
}

function findStarterChapter(book) {
  return book.chapters.find((chapter) => !/目录/.test(chapter.title)) || book.chapters[0];
}

function stripRepeatedTitle(text, title) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (normalizeTitle(lines[0]) === normalizeTitle(title)) {
    return lines.slice(1).join("\n").trim();
  }
  return text;
}

function normalizeTitle(text = "") {
  return text.replace(/\s/g, "").replace(/[《》]/g, "");
}

function textToHtml(text) {
  return text
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function makeSnippet(text, index, queryLength) {
  const start = Math.max(0, index - 36);
  const end = Math.min(text.length, index + queryLength + 56);
  return `${start > 0 ? "..." : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "..." : ""}`;
}

function highlight(text, query) {
  const escapedText = escapeHtml(text);
  const pattern = escapeRegExp(escapeHtml(query));
  return escapedText.replace(new RegExp(pattern, "gi"), (match) => `<mark>${match}</mark>`);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function shortNumber(value) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)} 亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return numberFormatter.format(value);
}
