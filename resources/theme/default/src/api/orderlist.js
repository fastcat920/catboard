import request, { requestMessage } from './request';

/**
 * 获取订单列表
 * @param {number} page 当前页
 * @param {number} pageSize 每页数量
 * @returns {Promise} 返回标准化后的订单分页数据
 */
export function fetchOrderList(page = 1, pageSize = 10) {
  return request({
    url: '/user/order/fetch',
    method: 'get',
    params: { page, pageSize }
  }).then(response => {
    if (!response || typeof response !== 'object') throw new Error(requestMessage('responseError'));

    const dataField = response.data;
    const container = dataField && !Array.isArray(dataField) && typeof dataField === 'object'
      ? dataField
      : response;
    const orders = Array.isArray(dataField)
      ? dataField
      : [container.data, container.orders, container.list, container.items]
          .find(Array.isArray) || [];
    const totalValue = container.total
      ?? response.total
      ?? container.total_count
      ?? container.totalRecords;
    const total = Number(totalValue);
    const paginated = Number.isFinite(total)
      || container.current_page !== undefined
      || container.last_page !== undefined;

    return {
      data: orders,
      total: Number.isFinite(total) ? total : orders.length,
      paginated
    };
  }).catch(error => {
    console.error('Error fetching order list:', error);
    throw error;
  });
}

/**
 * 取消订单
 * @param {string} tradeNo 订单号
 * @returns {Promise} 返回Promise，成功时返回取消结果
 */
export async function cancelOrder(tradeNo) {
  if (!tradeNo) throw new Error(requestMessage('missingOrderNumber'));

  const response = await request({
    url: '/user/order/cancel',
    method: 'post',
    data: { trade_no: tradeNo }
  });
  if (!response || typeof response !== 'object') {
    throw new Error(requestMessage('responseError'));
  }
  return response;
}
