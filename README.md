# 唱片库

个人唱片收藏 Web App。界面采用克制的系统级视觉，支持分区浏览、最喜欢的 10 张、封面抽出动画、Discogs 搜索、MusicBuddy CSV 导入、资料编辑和手机访问。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## Discogs

在 [Discogs Developer Settings](https://www.discogs.com/settings/developers) 创建 Personal Access Token，然后写入 `.env.local`：

```bash
DISCOGS_TOKEN=你的_token
```

Token 只由服务端 Route Handler 读取，不会进入浏览器代码。

## 数据

- 唱片是 D1 持久化数据，可在桌面和手机看到同一份资料。
- 初始数据库来自 MusicBuddy CSV，共 106 张，不包含演示唱片。
- 「喜欢」由用户通过封面心形或详情页手动选择，最多保留 10 张；桌面和手机同步。
- CSV 导入保留标题、艺人、封面、发行年份、购买日期、价格、Discogs ID、介质和曲目。
- 重复导入会更新原记录，不会重复生成。
- 详情页支持编辑封面、标题、艺人、发行日期、购买日期、购买价格、介质、豆瓣链接和曲目。
- 介质类型只在详情与编辑界面出现，不在首页封面网格展示。

## 豆瓣

应用不抓取豆瓣条目或封面。可以从添加页打开豆瓣官方音乐搜索，并手动保存豆瓣条目链接及可编辑资料。这样做是因为豆瓣当前没有适合此用途的公开音乐 API，且其[法律声明](https://www.douban.com/about/legal)要求站外使用条目信息、图片或 API 数据前取得书面许可。

## 构建

```bash
npm run lint
npx tsc --noEmit
npm run build
```
