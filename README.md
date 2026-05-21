# 大李敖全集 6.0 在线阅读站

这是基于 `《大李敖全集6.0》分章节` 生成的静态在线阅读网站。

## 本地预览

```powershell
node scripts/serve.mjs 4173
```

然后打开：

```text
http://127.0.0.1:4173/
```

## 重新生成数据

如果更新了分章节 TXT，运行：

```powershell
node scripts/build-data.mjs
```

脚本会重新生成：

- `data/catalog.json`
- `data/books/*.json`

## 当前功能

- 18 个分类、195 本书、10242 篇章节索引
- mdBook 风格左侧目录树
- 单本懒加载，进入一本书后连续呈现本书目录与正文
- 全局书名/篇名搜索
- 当前书正文搜索
- 明暗主题、字号调节、继续阅读记忆
