# DeepSink-English 项目上下文

## 项目概述

这是一个基于 React 的沉浸式英语学习应用程序，利用 Google Gemini API 提供实时语音对话功能。用户可以与 AI 角色进行实时英语对话练习，并获得发音和流利度的即时反馈。

## 核心技术栈

- React 19.2.1
- TypeScript
- Vite 构建工具
- Google Gemini API (gemini-2.5-flash-native-audio-preview-09-2025)
- Tailwind CSS
- Web Audio API
- WebGL Shaders (用于背景视觉效果)

## 项目架构

- `App.tsx`: 主应用组件，管理状态、音频流、会话控制和 UI
- `services/gemini.ts`: Gemini API 服务，处理实时连接、音频传输、图像分析和报告生成
- `components/`: UI 组件目录 (ShaderBackground, AudioVisualizer, SessionResult 等)
- `constants.ts`: 定义角色 (Personas)、场景 (Scenes) 和着色器代码
- `types.ts`: 类型定义文件
- `utils/audioUtils.ts`: 音频处理工具

## 主要功能

1. **实时语音对话**: 使用 Gemini Live API 实现用户与 AI 的实时语音交互
2. **多角色系统**: 提供多个 AI 角色 (如 Ross-讽刺朋友, Olivia-NYC 银行家, Jake-冲浪者) 
3. **沉浸式场景**: 支持多种背景场景 (咖啡店、海滩、办公室等)，包含视觉和音频效果
4. **图像分析**: 用户可上传图片，AI 会分析图片并以此为话题开始对话
5. **会话评分**: 会话结束后生成流利度、词汇、地道性等评分报告
6. **历史记录**: 本地存储会话历史和评分结果

## 构建和运行

- 安装依赖: `npm install`
- 设置环境变量: 在 `.env.local` 中设置 `GEMINI_API_KEY`
- 启动应用: `npm run dev`
- 构建应用: `npm run build`

## 开发约定

- 使用 TypeScript 进行类型安全的开发
- 组件采用 React 函数式组件和 Hooks
- 音频处理遵循 Web Audio API 标准
- UI 使用 Tailwind CSS 进行样式设计
- 状态管理使用 React 内置的 useState 和 useRef
- 代码遵循标准的 React 和 TypeScript 最佳实践