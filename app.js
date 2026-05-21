const state = {
  catalog: null,
  categoryMap: new Map(),
  bookMap: new Map(),
  chaptersByBook: new Map(),
  loadedBooks: new Map(),
  currentBook: null,
  fontSize: Number(localStorage.getItem("leeaoFontSize")) || 19,
  theme: localStorage.getItem("leeaoTheme") || "light",
};

const $ = (id) => document.getElementById(id);
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
  renderSidebar();
  handleRoute();
  window.addEventListener("hashchange", handleRoute);
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
  $("bookFilter").addEventListener("input", renderSidebar);
  $("globalSearch").addEventListener("input", (event) => renderSearch(event.target.value));
  $("fontDown").addEventListener("click", () => setFontSize(state.fontSize - 1));
  $("fontUp").addEventListener("click", () => setFontSize(state.fontSize + 1));
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

function renderSidebar() {
  const query = $("bookFilter").value.trim().toLowerCase();
  $("sidebarStats").textContent = `${numberFormatter.format(state.catalog.totals.books)} 本 · ${numberFormatter.format(state.catalog.totals.chapters)} 篇`;

  $("outline").innerHTML = state.catalog.categories
    .map((category) => {
      const books = state.catalog.books.filter((book) => {
        if (book.categoryId !== category.id) return false;
        if (!query) return true;
        return `${book.title} ${book.categoryTitle}`.toLowerCase().includes(query);
      });
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
}

function handleRoute() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, "")) || "home";
  const [route, bookId, chapterId] = hash.split("/");

  if (route === "book" && bookId) {
    openBook(bookId, chapterId);
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

  const lower = query.toLowerCase();
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
        title: highlight(book.title, query),
        meta: `${escapeHtml(book.categoryTitle)} · ${numberFormatter.format(book.chapterCount)} 篇`,
      })),
    )}
    ${renderResultGroup(
      "篇名",
      chapterMatches.map((chapter) => ({
        href: `#book/${chapter.bookId}/${chapter.id}`,
        title: highlight(chapter.title, query),
        meta: `${escapeHtml(chapter.bookTitle)} · ${escapeHtml(chapter.categoryTitle)}`,
      })),
    )}
    ${renderResultGroup(
      state.currentBook ? `当前书正文：${state.currentBook.title}` : "当前书正文",
      bodyMatches.map(({ chapter, index }) => ({
        href: `#book/${state.currentBook.id}/${chapter.id}`,
        title: highlight(chapter.title, query),
        meta: highlight(makeSnippet(chapter.text, index, query.length), query),
      })),
      state.currentBook ? "正文搜索至少输入两个字。" : "打开一本书后可搜索正文。",
    )}
  `;

  $("closeSearch").addEventListener("click", () => {
    $("globalSearch").value = "";
    renderSearch("");
  });
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
