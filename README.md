# 合約套利监控系统

## 项目概述

这是一个用于监控币安(Binance)和欧意(OKX)交易所资金费率套利机会的实时监控系统。系统完全使用 TypeScript 开发，包含后端服务和 React 前端界面。

## 技术栈

### 后端
- **运行时**: Node.js (>=18.0.0)
- **语言**: TypeScript 5.x
- **HTTP框架**: Fastify (高性能)
- **WebSocket**: ws 库
- **HTTP客户端**: axios (支持代理配置)
- **日志**: pino (高性能日志库)

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **状态管理**: Zustand (轻量级)
- **UI组件**: Ant Design
- **WebSocket客户端**: 原生 WebSocket API
- **样式**: TailwindCSS