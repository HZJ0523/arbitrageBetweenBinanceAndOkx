import React, { useState } from 'react';
import {
  Drawer,
  Form,
  Input,
  Switch,
  Radio,
  InputNumber,
  Button,
  Space,
  Divider,
  message,
} from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useSettingsStore } from '../stores/settings';
import { sendConfigUpdate } from '../services/websocket';

interface SettingsProps {
  open: boolean;
  onClose: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ open, onClose }) => {
  const [form] = Form.useForm();

  const {
    binanceApiKey,
    binanceApiSecret,
    okxApiKey,
    okxApiSecret,
    okxPassphrase,
    proxyUrl,
    autoMonitorEnabled,
    autoMonitorMode,
    intervalSeconds,
    fixedMinute,
    fixedSecond,
    setApiConfig,
    setProxyUrl,
    setAutoMonitor,
    getMonitorConfig,
  } = useSettingsStore();

  const [showApiSecrets, setShowApiSecrets] = useState(false);

  // 初始化表单值
  React.useEffect(() => {
    if (open) {
      form.setFieldsValue({
        binanceApiKey,
        binanceApiSecret,
        okxApiKey,
        okxApiSecret,
        okxPassphrase,
        proxyUrl,
        autoMonitorEnabled,
        autoMonitorMode,
        intervalSeconds,
        fixedMinute,
        fixedSecond,
      });
    }
  }, [open, form, binanceApiKey, binanceApiSecret, okxApiKey, okxApiSecret, okxPassphrase, proxyUrl, autoMonitorEnabled, autoMonitorMode, intervalSeconds, fixedMinute, fixedSecond]);

  const handleSave = () => {
    form.validateFields().then((values) => {
      // 保存到 store
      setApiConfig({
        binanceApiKey: values.binanceApiKey,
        binanceApiSecret: values.binanceApiSecret,
        okxApiKey: values.okxApiKey,
        okxApiSecret: values.okxApiSecret,
        okxPassphrase: values.okxPassphrase,
      });
      setProxyUrl(values.proxyUrl || '');
      setAutoMonitor({
        enabled: values.autoMonitorEnabled,
        mode: values.autoMonitorMode,
        intervalSeconds: values.intervalSeconds,
        fixedMinute: values.fixedMinute,
        fixedSecond: values.fixedSecond,
      });

      // 发送配置到服务器
      const config = getMonitorConfig();
      sendConfigUpdate(config);

      message.success('设置已保存');
      onClose();
    });
  };

  return (
    <Drawer
      title={
        <Space>
          <SettingOutlined />
          <span>设置</span>
        </Space>
      }
      placement="right"
      width={480}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSave}>
            保存
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          autoMonitorEnabled: false,
          autoMonitorMode: 'interval',
          intervalSeconds: 60,
          fixedMinute: 0,
          fixedSecond: 0,
        }}
      >
        {/* 代理配置 */}
        <Divider orientation="left">代理配置</Divider>
        <Form.Item
          label="代理服务器地址"
          name="proxyUrl"
          extra="支持 HTTP/HTTPS/SOCKS5 代理，如: http://127.0.0.1:7890"
        >
          <Input placeholder="http://127.0.0.1:7890" />
        </Form.Item>

        {/* 币安 API */}
        <Divider orientation="left">币安 API</Divider>
        <Form.Item label="API Key" name="binanceApiKey">
          <Input placeholder="输入币安 API Key" />
        </Form.Item>
        <Form.Item label="API Secret" name="binanceApiSecret">
          <Input.Password
            placeholder="输入币安 API Secret"
            visibilityToggle={{
              visible: showApiSecrets,
              onVisibleChange: setShowApiSecrets,
            }}
          />
        </Form.Item>

        {/* OKX API */}
        <Divider orientation="left">OKX API</Divider>
        <Form.Item label="API Key" name="okxApiKey">
          <Input placeholder="输入 OKX API Key" />
        </Form.Item>
        <Form.Item label="API Secret" name="okxApiSecret">
          <Input.Password
            placeholder="输入 OKX API Secret"
            visibilityToggle={{
              visible: showApiSecrets,
              onVisibleChange: setShowApiSecrets,
            }}
          />
        </Form.Item>
        <Form.Item label="Passphrase" name="okxPassphrase">
          <Input.Password
            placeholder="输入 OKX Passphrase"
            visibilityToggle={{
              visible: showApiSecrets,
              onVisibleChange: setShowApiSecrets,
            }}
          />
        </Form.Item>

        {/* 自动监控 */}
        <Divider orientation="left">自动监控</Divider>
        <Form.Item
          label="启用自动监控"
          name="autoMonitorEnabled"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prev, curr) =>
            prev.autoMonitorEnabled !== curr.autoMonitorEnabled
          }
        >
          {({ getFieldValue }) =>
            getFieldValue('autoMonitorEnabled') && (
              <>
                <Form.Item label="监控模式" name="autoMonitorMode">
                  <Radio.Group>
                    <Radio value="interval">间隔模式</Radio>
                    <Radio value="fixed">固定时间模式</Radio>
                  </Radio.Group>
                </Form.Item>

                <Form.Item
                  noStyle
                  shouldUpdate={(prev, curr) =>
                    prev.autoMonitorMode !== curr.autoMonitorMode
                  }
                >
                  {({ getFieldValue: getValue }) =>
                    getValue('autoMonitorMode') === 'interval' ? (
                      <Form.Item
                        label="刷新间隔（秒）"
                        name="intervalSeconds"
                        rules={[
                          { required: true, message: '请输入刷新间隔' },
                          { type: 'number', min: 10, message: '最小间隔 10 秒' },
                        ]}
                      >
                        <InputNumber min={10} max={3600} style={{ width: '100%' }} />
                      </Form.Item>
                    ) : (
                      <>
                        <Form.Item
                          label="每小时第几分钟执行"
                          name="fixedMinute"
                          rules={[
                            { required: true, message: '请输入分钟数' },
                            {
                              type: 'number',
                              min: 0,
                              max: 59,
                              message: '分钟数范围 0-59',
                            },
                          ]}
                        >
                          <InputNumber min={0} max={59} style={{ width: '100%' }} addonAfter="分" />
                        </Form.Item>
                        <Form.Item
                          label="第几秒执行"
                          name="fixedSecond"
                          rules={[
                            { required: true, message: '请输入秒数' },
                            {
                              type: 'number',
                              min: 0,
                              max: 59,
                              message: '秒数范围 0-59',
                            },
                          ]}
                        >
                          <InputNumber min={0} max={59} style={{ width: '100%' }} addonAfter="秒" />
                        </Form.Item>
                      </>
                    )
                  }
                </Form.Item>
              </>
            )
          }
        </Form.Item>
      </Form>
    </Drawer>
  );
};

export default Settings;
