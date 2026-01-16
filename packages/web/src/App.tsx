import React, { useState, useEffect } from 'react';
import { ConfigProvider, Layout, Button, Space, message } from 'antd';
import {
  SettingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import {
  StatusBar,
  Settings,
  FundingRateTable,
  LogPanel,
} from './components';
import { useWebSocket } from './hooks/useWebSocket';
import { useSettingsStore } from './stores/settings';

const { Header, Content, Footer } = Layout;

const App: React.FC = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { isConnected, isRefreshing, manualRefresh, updateConfig } = useWebSocket();
  const getMonitorConfig = useSettingsStore((state) => state.getMonitorConfig);

  // 连接后发送初始配置
  useEffect(() => {
    if (isConnected) {
      const config = getMonitorConfig();
      updateConfig(config);
    }
  }, [isConnected, getMonitorConfig, updateConfig]);

  const handleManualRefresh = () => {
    if (!isConnected) {
      message.warning('WebSocket 未连接');
      return;
    }
    manualRefresh();
    message.info('正在刷新数据...');
  };

  return (
    <ConfigProvider locale={zhCN}>
      <Layout className="min-h-screen">
        {/* 头部 */}
        <Header className="flex items-center justify-between bg-white shadow-sm px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold m-0 text-gray-800">
              合約套利监控系统
            </h1>
          </div>
          <Space>
            <Button
              icon={<ReloadOutlined spin={isRefreshing} />}
              onClick={handleManualRefresh}
              loading={isRefreshing}
              disabled={!isConnected}
            >
              手动刷新
            </Button>
            <Button
              icon={<SettingOutlined />}
              onClick={() => setSettingsOpen(true)}
            >
              设置
            </Button>
          </Space>
        </Header>

        {/* 状态栏 */}
        <StatusBar />

        {/* 内容区 */}
        <Content className="p-6 bg-gray-50">
          <div className="max-w-[1800px] mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* 主要内容区 */}
              <div className="lg:col-span-3">
                <div className="bg-white rounded-lg p-4">
                  <h2 className="text-lg font-semibold mb-4">资金费率套利</h2>
                  <FundingRateTable />
                </div>
              </div>

              {/* 侧边栏 */}
              <div className="lg:col-span-1">
                <LogPanel />
              </div>
            </div>
          </div>
        </Content>

        {/* 底部 */}
        <Footer className="text-center bg-white border-t">
          <Space>
            <span>合約套利监控系统</span>
            <span className="text-gray-400">| By</span>
            <a
              href="https://github.com/HZJ0523"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-800"
            >
              @HZJ0523
            </a>
          </Space>
        </Footer>

        {/* 设置抽屉 */}
        <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </Layout>
    </ConfigProvider>
  );
};

export default App;
