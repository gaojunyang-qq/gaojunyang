import { readFile, access } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "README.md",
  "server.mjs",
  "assets/icon.svg",
];

for (const file of requiredFiles) {
  await access(file);
}

const [html, css, js, readme] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("styles.css", "utf8"),
  readFile("script.js", "utf8"),
  readFile("README.md", "utf8"),
]);

const checks = [
  [html.includes('<canvas id="gameCanvas"'), "index.html 应包含游戏 Canvas"],
  [html.includes('id="startScreen"'), "index.html 应包含开始界面"],
  [html.includes('id="gameOverScreen"'), "index.html 应包含失败界面"],
  [html.includes('id="scoreValue"') && html.includes('id="bestValue"'), "index.html 应包含分数与最高分"],
  [html.includes('script src="script.js"'), "index.html 应引用 script.js"],
  [html.includes('href="styles.css"'), "index.html 应引用 styles.css"],
  [css.includes("@media") && css.includes("100dvh"), "styles.css 应包含移动端适配"],
  [js.includes("requestAnimationFrame"), "script.js 应使用动画循环"],
  [js.includes("localStorage"), "script.js 应保存最高分"],
  [js.includes("pointerdown") && js.includes("keydown"), "script.js 应支持触屏/鼠标与键盘"],
  [readme.includes("Vercel") && readme.includes("Netlify") && readme.includes("GitHub Pages"), "README 应包含部署说明"],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);

if (failures.length > 0) {
  console.error("Smoke test failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Smoke test passed. Project files look ready.");
