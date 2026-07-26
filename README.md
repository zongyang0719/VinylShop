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

- Web 版唱片使用 D1 持久化数据。
- iOS App 把内置唱片库写入手机本地，之后的增删改以本机为准，不会被 Web 版后台刷新覆盖。
- iOS 设置中可把 JSON 备份导出到「文件」或 iCloud Drive，也可从该备份恢复。删除 App 会删除本机数据，删除前应先导出。
- 当前内置初始库共 142 张，不包含演示唱片。
- 「喜欢」由用户通过封面心形或详情页手动选择，最多保留 10 张；Web 版随 D1 同步，iOS 版保存在本机。
- CSV 导入保留标题、艺人、封面、发行年份、购买日期、价格、Discogs ID、介质和曲目。
- 重复导入会更新原记录，不会重复生成。
- 详情页把「查找封面」和「更新专辑信息」分成两条独立操作：前者只替换图片，后者不会改封面。
- Web 版「更新专辑信息」会并行核对 Apple 中国区、MusicBrainz、Discogs 和 Wikidata，并用 OpenCC 统一华语名称的简体显示。
- 更新结果先展示逐字段差异和来源，勾选采用后只写入编辑表单；保存前仍可手动修改。
- 资料字段包括标题、艺人、版本、发行日期、厂牌、流派、国家、编目号、条码、制作人、介质、豆瓣链接和曲目。
- 介质类型只在详情与编辑界面出现，不在首页封面网格展示。

## 豆瓣

应用不抓取豆瓣条目或封面。可以从添加页打开豆瓣官方音乐搜索，并手动保存豆瓣条目链接及可编辑资料。这样做是因为豆瓣当前没有适合此用途的公开音乐 API，且其[法律声明](https://www.douban.com/about/legal)要求站外使用条目信息、图片或 API 数据前取得书面许可。

## 构建

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## iOS App

```bash
npm run ios:build
```

在 Xcode 中选择 `App` target：

1. `Signing & Capabilities` 选择自己的 Apple Team。
2. 手机打开「设置 → 隐私与安全性 → 开发者模式」。
3. 顶部设备选择已连接的 iPhone，点击 Run。
4. 首次安装后若被系统拦截，到「设置 → 通用 → VPN 与设备管理」信任开发者。

iOS target 使用原生 App 壳，并按能力边界组合系统组件与现有定稿交互：

- 搜索使用 iOS 原生搜索 Sheet；设置中的选择器、开关、文件导入导出和触觉反馈使用系统能力。
- 唱片架、详情页、编辑页和同专辑多版本切换保留现有定稿实现，不用通用原生列表近似替换。唱片架继续使用 50px 间距、每张 3° 翻角、中线 90° 侧立封套、25 个可视槽位、无限循环、左侧艺人轮及原机械滚动节奏。
- 当前 142 条记录会合并显示成 125 张唱片卡；其中 16 组包含多个实体版本，共 33 条版本记录。详情页可切换各版本并分别编辑。
- 142 张初始记录和 137 份去重封面随安装包内置；封面在离线和真机环境均从 App 本地资源读取。
- 唱片资料保存在 WebKit 的 App 本地存储中；设置页可通过系统文件面板导出 JSON 至「文件」或 iCloud Drive，也可从备份恢复。
- iOS 版可直接从 Apple 中国区与 MusicBrainz 更新资料、从 Apple Music 查找封面，也可从相册选图；繁简体、全半角与标点差异会在匹配时统一。
- 需要服务端密钥的 Discogs 与 Wikidata 增强仍只在 Web 版使用，密钥不会写入 App。

如初始库的封面地址发生变化，重新生成 iOS 封面资源：

```bash
npm run ios:covers
```
