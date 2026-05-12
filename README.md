# 星轨闪避 Starway Sprint

一个从零创建的纯前端网页小游戏，使用 HTML、CSS 和 JavaScript Canvas 实现。项目不需要后端和构建步骤，可以直接部署到 Vercel、Netlify、GitHub Pages。

## 功能

- 开始界面、游戏主界面、失败重开
- 当前分数与本地最高分
- 键盘、鼠标、手机触屏操作
- 响应式布局，适配手机和电脑浏览器
- 无第三方运行依赖，静态托管即可上线

## 本地运行

方式一：使用项目自带的零依赖静态服务器

```bash
node server.mjs
```

打开：

```text
http://localhost:4173
```

如果本机安装了 npm，也可以使用：

```bash
npm start
```

方式二：使用 Python 静态服务器

```bash
python -m http.server 4173
```

方式三：直接打开 `index.html`

大多数现代浏览器可以直接打开本项目的 `index.html`。为了更接近线上环境，推荐使用静态服务器方式。

## 操作

- 键盘：`←` / `→` 或 `A` / `D` 移动，`Space` / `Enter` 开始或重开
- 鼠标：在游戏区域移动或拖动飞船
- 手机：拖动游戏区域，或按住右下角方向按钮

## 测试

项目包含一个轻量静态冒烟测试：

```bash
npm test
```

没有 npm 时可以直接运行：

```bash
node tests/smoke-test.mjs
```

该测试会检查核心文件、页面结构、移动端样式、最高分保存和输入事件是否存在。

本机安装 Chrome 或 Edge 时，还可以运行浏览器冒烟测试：

```bash
npm run test:browser
```

没有 npm 时可以直接运行：

```bash
node tests/browser-smoke.mjs
```

该测试会启动本地页面，模拟桌面键盘/鼠标和移动端触屏操作，并生成截图到 `.tmp/screenshots/`。

## 上传到 GitHub

先确保本机已经安装 Git，并且可以在终端运行 `git --version`。

在项目根目录执行：

```bash
git init
git add .
git commit -m "Create starway sprint game"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<你的仓库名>.git
git push -u origin main
```

如果仓库已经存在并且已经配置了远程地址，可以跳过 `git init` 和 `git remote add origin ...`。

## 部署到 Vercel

1. 登录 [Vercel](https://vercel.com/)。
2. 点击 `Add New...`，选择 `Project`。
3. 导入 GitHub 仓库。
4. Framework Preset 选择 `Other`。
5. Build Command 留空。
6. Output Directory 留空或填写 `.`。
7. 点击 `Deploy`。

也可以使用 Vercel CLI：

```bash
npm i -g vercel
vercel
vercel --prod
```

## 部署到 Netlify

1. 登录 [Netlify](https://www.netlify.com/)。
2. 点击 `Add new site`，选择 `Import an existing project`。
3. 连接 GitHub 仓库。
4. Build command 留空。
5. Publish directory 填写 `.`。
6. 点击 `Deploy site`。

也可以直接把整个项目文件夹拖到 Netlify 的手动部署区域。

## 部署到 GitHub Pages

1. 将项目推送到 GitHub。
2. 打开仓库页面，进入 `Settings`。
3. 进入 `Pages`。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`。
6. 保存后等待 GitHub Pages 自动发布。

发布地址通常是：

```text
https://<你的用户名>.github.io/<你的仓库名>/
```

## 项目结构

```text
.
├── assets/
│   └── icon.svg
├── tests/
│   ├── browser-smoke.mjs
│   └── smoke-test.mjs
├── index.html
├── styles.css
├── script.js
├── server.mjs
├── package.json
├── .gitignore
└── README.md
```
