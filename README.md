# 动森训练岛 iOS App

动森风格的运动习惯养成 App，30 天渐进路线，每天一个结算按钮。

## 技术栈

- Capacitor 8.x (WebView 原生壳)
- 纯 HTML/CSS/JS (无框架)
- iOS 15+

## 开发

```bash
npm install
npx cap sync
```

浏览器打开 `www/index.html` 即可调试全部 UI 和逻辑。

## iOS 构建

push 到 main 分支 → GitHub Actions 自动编译 → 下载 artifact。

```bash
git push origin main
```

## 目录

| 目录 | 说明 |
|------|------|
| `www/` | Web 源码（HTML/CSS/JS） |
| `ios/` | Xcode 项目 |
| `resources/` | App 图标 |
| `.github/workflows/` | CI/CD |

## 修改 App

永远只改 `www/`，然后 `npx cap sync`。
