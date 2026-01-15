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

## 项目结构

```
/
├── packages/
│   ├── server/                 # 后端服务
│   │   ├── src/
│   │   │   ├── index.ts        # 入口文件
│   │   │   ├── app.ts          # Fastify 应用配置
│   │   │   ├── websocket.ts    # WebSocket 服务器
│   │   │   ├── exchanges/      # 交易所API封装
│   │   │   │   ├── types.ts    # 通用类型定义
│   │   │   │   ├── base.ts     # 交易所基类
│   │   │   │   ├── binance.ts  # 币安API
│   │   │   │   └── okx.ts      # OKX API
│   │   │   ├── services/       # 业务逻辑
│   │   │   │   ├── monitor.ts  # 监控服务主逻辑
│   │   │   │   └── funding-rate-arbitrage.ts  # 资金费率套利
│   │   │   ├── utils/          # 工具函数
│   │   │   │   ├── logger.ts   # 日志工具
│   │   │   │   ├── scheduler.ts # 定时调度器
│   │   │   │   └── symbol-normalizer.ts # 交易对名称标准化
│   │   │   └── types/          # 类型定义
│   │   │       └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                    # 前端应用
│       ├── src/
│       │   ├── main.tsx        # 入口
│       │   ├── App.tsx         # 根组件
│       │   ├── components/     # UI组件
│       │   │   ├── Layout/
│       │   │   ├── FundingRateTable/    # 资金费率套利表格
│       │   │   ├── Settings/            # 设置面板(API Key、代理、监控配置)
│       │   │   ├── ManualRefresh/       # 手动刷新按钮
│       │   │   └── StatusBar/           # 状态栏(连接状态、错误提示)
│       │   ├── stores/         # Zustand 状态管理
│       │   │   ├── settings.ts          # 设置状态
│       │   │   ├── arbitrage.ts         # 套利数据状态
│       │   │   └── connection.ts        # 连接状态
│       │   ├── hooks/          # 自定义Hooks
│       │   │   └── useWebSocket.ts
│       │   ├── services/       # 前端服务
│       │   │   └── websocket.ts
│       │   ├── types/          # 类型定义
│       │   │   └── index.ts
│       │   └── utils/          # 工具函数
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── tailwind.config.js
│
├── package.json                # 根 package.json (workspace)
├── tsconfig.base.json          # 基础 TS 配置
├── pnpm-workspace.yaml         # pnpm workspace 配置
└── README.md
