import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Card, Select, InputNumber, Button, Space, message, Tooltip, Modal } from 'antd';
import { ThunderboltOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useArbitrageStore } from '../stores/arbitrage';
import { sendOpenArbitrage, addArbitrageResultCallback } from '../services/websocket';
import type { ArbitrageResultPayload } from '../types';

export const StartArbitragePanel: React.FC = memo(() => {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [usdtAmount, setUsdtAmount] = useState<number | null>(null);
  const [inputFocused, setInputFocused] = useState(false);

  const fundingRateArbitrage = useArbitrageStore((state) => state.fundingRateArbitrage);
  const activePositions = useArbitrageStore((state) => state.activePositions);
  const accountInfo = useArbitrageStore((state) => state.accountInfo);
  const isOpening = useArbitrageStore((state) => state.isOpening);

  // 检查两所账户是否都可用
  const isBothAccountsAvailable = useMemo(() =>
    accountInfo?.binance.configured &&
    !accountInfo?.binance.error &&
    accountInfo?.okx.configured &&
    !accountInfo?.okx.error,
    [accountInfo]
  );

  // 获取交易对选项 - 过滤掉正在套利中的交易对
  const symbolOptions = useMemo(() => {
    // 获取正在套利中的交易对集合
    const activeSymbols = new Set(activePositions.map(p => p.symbol));

    // 过滤掉已在套利中的交易对
    return fundingRateArbitrage
      .filter((item) => !activeSymbols.has(item.symbol))
      .map((item) => ({
        label: `${item.symbol}/USDT (年化: ${item.annualizedYieldPercent})`,
        value: item.symbol,
      }));
  }, [fundingRateArbitrage, activePositions]);

  // 设置套利结果回调
  useEffect(() => {
    const handleResult = (result: ArbitrageResultPayload) => {
      if (result.action === 'open') {
        if (result.success) {
          message.success(`${result.position?.symbol}交易对开始套利！`);
        } else {
          if (result.error?.includes('请手动平仓')) {
            Modal.error({
              title: '开仓异常',
              content: result.error,
              okText: '知道了',
            });
          } else {
            message.error(result.error || '开仓失败');
          }
        }
      }
    };

    return addArbitrageResultCallback(handleResult);
  }, []);

  // 当套利机会列表或活跃仓位更新时，检查选中的交易对是否还可用
  useEffect(() => {
    if (selectedSymbol) {
      // 检查是否还在套利机会列表中
      const existsInArbitrage = fundingRateArbitrage.some((item) => item.symbol === selectedSymbol);
      // 检查是否已在套利中
      const isActivePosition = activePositions.some((p) => p.symbol === selectedSymbol);

      if (!existsInArbitrage) {
        setSelectedSymbol(null);
        message.warning('选中的交易对已不在套利机会列表中');
      } else if (isActivePosition) {
        setSelectedSymbol(null);
        message.info('选中的交易对已开始套利');
      }
    }
  }, [fundingRateArbitrage, activePositions, selectedSymbol]);

  const handleConfirm = useCallback(() => {
    if (!selectedSymbol) {
      message.warning('请选择交易对');
      return;
    }
    if (!usdtAmount || usdtAmount <= 0) {
      message.warning('请输入有效的USDT开仓量');
      return;
    }

    const symbol = selectedSymbol;
    const amount = usdtAmount;

    Modal.confirm({
      title: '确认开仓',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>交易对: <strong>{symbol}/USDT</strong></p>
          <p>开仓金额: <strong>{amount} USDT</strong></p>
          <p style={{ color: '#ff4d4f', marginTop: 8 }}>
            请确认两所USDT可用余额充足！
          </p>
        </div>
      ),
      okText: '确认开仓',
      cancelText: '取消',
      onOk: () => {
        sendOpenArbitrage(symbol, amount);
        setSelectedSymbol(null);
        setUsdtAmount(null);
      },
    });
  }, [selectedSymbol, usdtAmount]);

  const handleFocus = useCallback(() => setInputFocused(true), []);
  const handleBlur = useCallback(() => setInputFocused(false), []);

  // 如果两所账户不都可用，不显示面板
  if (!isBothAccountsAvailable) {
    return null;
  }

  return (
    <Card
      title={
        <Space>
          <ThunderboltOutlined />
          开始套利
        </Space>
      }
      size="small"
      style={{ marginTop: '16px' }}
    >
      <div className="flex flex-col gap-4">
        {/* 交易对选择 */}
        <div>
          <div className="text-sm text-gray-500 mb-1">选择交易对</div>
          <Select
            placeholder="请选择套利交易对"
            style={{ width: '100%' }}
            options={symbolOptions}
            value={selectedSymbol}
            onChange={setSelectedSymbol}
            showSearch
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            notFoundContent="暂无套利机会"
          />
        </div>

        {/* USDT开仓量 */}
        <div>
          <div className="text-sm text-gray-500 mb-1">USDT开仓量</div>
          <Tooltip
            title="下单前，请先检查两所USDT可用量"
            open={inputFocused}
            placement="top"
          >
            <InputNumber
              placeholder="输入开仓金额"
              style={{ width: '100%' }}
              min={1}
              precision={0}
              value={usdtAmount}
              onChange={setUsdtAmount}
              onFocus={handleFocus}
              onBlur={handleBlur}
              addonAfter="USDT"
            />
          </Tooltip>
        </div>

        {/* 确认按钮 */}
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={handleConfirm}
          loading={isOpening}
          disabled={!selectedSymbol || !usdtAmount || usdtAmount <= 0}
          block
        >
          {isOpening ? '开仓中...' : '确认开仓'}
        </Button>
      </div>
    </Card>
  );
});

StartArbitragePanel.displayName = 'StartArbitragePanel';

export default StartArbitragePanel;
