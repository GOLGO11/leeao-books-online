import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "《大李敖全集6.0》分章节");
const DATA_DIR = path.join(ROOT, "data");
const BOOKS_DIR = path.join(DATA_DIR, "books");

const collator = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "base",
});

function stripNumber(name) {
  return name.replace(/^\d+\./, "").replace(/\.txt$/i, "").trim();
}

function codeFromName(name, fallback) {
  const match = name.match(/^(\d+)\./);
  return match ? match[1] : String(fallback).padStart(3, "0");
}

function makeId(prefix, code) {
  return `${prefix}${code.padStart(3, "0")}`;
}

function normalizeText(raw) {
  return raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function countChars(text) {
  return text.replace(/\s/g, "").length;
}

function chapterSort(a, b) {
  const aToc = /目录/.test(a.name) && !/^\d+\./.test(a.name);
  const bToc = /目录/.test(b.name) && !/^\d+\./.test(b.name);
  if (aToc !== bToc) return aToc ? -1 : 1;
  return collator.compare(a.name, b.name);
}

async function listEntries(dir, withFileTypes = true) {
  const entries = await readdir(dir, { withFileTypes });
  return entries.sort((a, b) => collator.compare(a.name, b.name));
}

async function collectTxtFiles(dir, baseDir = dir) {
  const entries = await listEntries(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTxtFiles(fullPath, baseDir)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".txt")) {
      files.push({
        name: entry.name,
        fullPath,
        relativePath: path.relative(baseDir, fullPath).split(path.sep).join("/"),
      });
    }
  }

  return files;
}

const gb18030Decoder = new TextDecoder("gb18030");
const utf8Decoder = new TextDecoder("utf-8");

async function readSourceText(filePath) {
  const buffer = await readFile(filePath);
  const hasUtf8Bom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const text = hasUtf8Bom ? utf8Decoder.decode(buffer) : gb18030Decoder.decode(buffer);
  return normalizeText(text);
}

async function build() {
  await rm(DATA_DIR, { recursive: true, force: true });
  await mkdir(BOOKS_DIR, { recursive: true });

  const rootEntries = await listEntries(SOURCE_DIR);
  const introFile = rootEntries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".txt"));
  const introText = introFile ? await readSourceText(path.join(SOURCE_DIR, introFile.name)) : "";

  const categoryDirs = rootEntries.filter((entry) => entry.isDirectory());
  const categories = [];
  const books = [];
  const chaptersIndex = [];

  let totalChapters = 0;
  let totalChars = 0;

  for (let categoryPosition = 0; categoryPosition < categoryDirs.length; categoryPosition += 1) {
    const categoryEntry = categoryDirs[categoryPosition];
    const categoryCode = codeFromName(categoryEntry.name, categoryPosition + 1);
    const categoryId = makeId("c", categoryCode);
    const categoryTitle = stripNumber(categoryEntry.name);
    const categoryPath = path.join(SOURCE_DIR, categoryEntry.name);
    const bookDirs = (await listEntries(categoryPath)).filter((entry) => entry.isDirectory());
    const bookIds = [];

    for (let bookPosition = 0; bookPosition < bookDirs.length; bookPosition += 1) {
      const bookEntry = bookDirs[bookPosition];
      const bookCode = codeFromName(bookEntry.name, bookPosition + 1);
      const bookId = `${categoryId}-b${bookCode}`;
      const bookTitle = stripNumber(bookEntry.name);
      const bookPath = path.join(categoryPath, bookEntry.name);
      const files = (await collectTxtFiles(bookPath)).sort(chapterSort);
      const chapters = [];
      let bookChars = 0;

      for (let chapterPosition = 0; chapterPosition < files.length; chapterPosition += 1) {
        const file = files[chapterPosition];
        const chapterCode = codeFromName(file.name, chapterPosition + 1);
        const chapterId = `${bookId}-ch${String(chapterPosition + 1).padStart(4, "0")}`;
        const title = stripNumber(file.name);
        const text = await readSourceText(file.fullPath);
        const charCount = countChars(text);

        bookChars += charCount;

        const chapter = {
          id: chapterId,
          title,
          order: chapterPosition + 1,
          number: chapterCode,
          sourceFile: file.relativePath,
          charCount,
          text,
        };

        chapters.push(chapter);
        chaptersIndex.push({
          id: chapterId,
          bookId,
          categoryId,
          title,
          bookTitle,
          categoryTitle,
          order: chapterPosition + 1,
          charCount,
        });
      }

      const bookRecord = {
        id: bookId,
        title: bookTitle,
        order: bookPosition + 1,
        code: bookCode,
        categoryId,
        categoryTitle,
        chapterCount: chapters.length,
        charCount: bookChars,
        firstChapterId: chapters[0]?.id ?? null,
      };

      books.push(bookRecord);
      bookIds.push(bookId);
      totalChapters += chapters.length;
      totalChars += bookChars;

      await writeFile(
        path.join(BOOKS_DIR, `${bookId}.json`),
        JSON.stringify({ ...bookRecord, chapters }, null, 0),
        "utf8",
      );
    }

    categories.push({
      id: categoryId,
      title: categoryTitle,
      order: categoryPosition + 1,
      code: categoryCode,
      bookCount: bookIds.length,
      bookIds,
    });
  }

  const catalog = {
    title: "大李敖全集 6.0 在线阅读",
    sourceTitle: "《大李敖全集6.0》分章节",
    generatedAt: new Date().toISOString(),
    totals: {
      categories: categories.length,
      books: books.length,
      chapters: totalChapters,
      chars: totalChars,
    },
    intro: {
      title: introFile ? stripNumber(introFile.name) : "简介",
      text: introText,
      charCount: countChars(introText),
    },
    categories,
    books,
    chaptersIndex,
  };

  await writeFile(path.join(DATA_DIR, "catalog.json"), JSON.stringify(catalog, null, 0), "utf8");

  console.log(
    `Built ${categories.length} categories, ${books.length} books, ${totalChapters} chapters, ${totalChars} chars.`,
  );
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
