# MiniCamera

一个基于 Electron 的本地悬浮摄像头窗口，可用于录屏或直播时展示摄像头画面，也可播放本地视频列表。

[源码](https://github.com/WUTONGCN/mini-camera) · [下载](https://github.com/WUTONGCN/mini-camera/releases) · [反馈](https://github.com/WUTONGCN/mini-camera/issues)

## 功能

- 切换系统默认摄像头或指定摄像头。
- 圆形、方形、圆角方形窗口，置顶与透明度设置。
- 鼠标拖动位置，滚轮调整大小（100–500 px），右键菜单选择常用尺寸。
- 选择本地视频，多文件顺序循环播放；实际解码能力由 Electron/Chromium 决定。
- 托盘/菜单栏图标显示或隐藏窗口，单实例运行。

本工具不录制、不推流，也不提供虚拟摄像头。摄像头不采集音频，本地视频静音播放。

## 开发与构建

需要 Node.js 22.12+（建议 Node.js 22）、npm，以及 Windows 或 macOS。

```sh
git clone https://github.com/WUTONGCN/mini-camera.git
cd mini-camera
npm ci
npm run check
npm test
npm start
```

`npm run dev` 会打开开发者工具。安装时需下载 Electron 二进制；企业代理环境请自行配置 npm/Electron 下载代理，不要把凭据写入仓库。

```sh
# 在当前平台生成可运行应用目录
npm run build:dir
# Windows 主机：NSIS 安装包及便携版（x64）
npm run build:win
# macOS 主机：DMG（x64 和 arm64）
npm run build:mac
```

输出位于 `dist/`。图标源文件已包含在仓库，macOS 图标由 electron-builder 从 `icon.png` 生成。默认构建不包含开发者签名或 Apple 公证；正式分发时应自行配置签名，私钥及证书不要提交。
GitHub Actions 在 Windows 和 macOS 上运行测试及目录打包检查。

## 使用

1. 启动后允许系统摄像头权限；默认显示 150 px 圆形窗口。
2. 在窗口上右键，切换视频源、形状、透明度和置顶状态。
3. 左键拖动移动位置，滚轮缩放。隐藏后点击托盘/菜单栏图标恢复。
4. macOS 权限被拒绝时，可从右键菜单打开摄像头权限设置；Windows 请在系统的摄像头隐私设置中允许桌面应用访问。
5. 右键选择“退出”彻底关闭。**隐藏窗口不会关闭摄像头**；切换到视频或退出应用可释放摄像头。

## 隐私与安全

- 应用代码不上传摄像头画面、视频、设备列表或设置，无遥测和自动更新请求。
- 仅申请摄像头视频权限，不申请麦克风权限。页面使用 context isolation，关闭 Node integration，IPC 限制在指定接口和主窗口文档。
- 窗口设置、设备 ID 和视频绝对路径保存在 Electron `userData/config.json`（通常为 macOS `~/Library/Application Support/mini-camera/` 或 Windows `%APPDATA%/mini-camera/`）。
- 上述配置、诊断日志与摄像头画面可能含个人信息，反馈时请自行遮挡。

## 贡献与许可

自有源码采用 [MIT](LICENSE)。依赖及 Electron 所含第三方组件保留各自许可证；分发时请保留打包产物中的许可声明。
见 [贡献指南](CONTRIBUTING.md) 和 [安全说明](SECURITY.md)。
