import { memo } from 'react';
import { Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

export interface FundingRateDisplayProps {
  rate: number;
  percent: string;
}

export const FundingRateDisplay = memo<FundingRateDisplayProps>(({ rate, percent }) => {
  const isPositive = rate > 0;
  const color = isPositive ? 'red' : 'green';
  const icon = isPositive ? <ArrowUpOutlined /> : <ArrowDownOutlined />;

  return (
    <Tag color={color} icon={icon}>
      {percent}
    </Tag>
  );
});

FundingRateDisplay.displayName = 'FundingRateDisplay';

export default FundingRateDisplay;
